import argparse
import json
import shutil
from pathlib import Path

import pandas as pd


DEFAULT_YEARS = [2025]
EV_MIN = 50
EV_MAX = 120
LA_MIN = -90
LA_MAX = 90
GOOD_SAMPLE_MIN = 100
LOW_SAMPLE_MIN = 10


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build an EV/LA outcome lookup from Statcast CSV files."
    )
    parser.add_argument(
        "--years",
        nargs="+",
        type=int,
        default=DEFAULT_YEARS,
        help="Statcast seasons to include, for example: --years 2019 2020 2021",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help=(
            "Output directory. Defaults to Statcast_<year>/ev_la_table "
            "or Statcast_Combined/ev_la_table."
        ),
    )
    parser.add_argument(
        "--copy-to-data",
        action="store_true",
        help="Copy the generated ev_la_lookup.json to data/ev_la_lookup.json.",
    )
    return parser.parse_args()


def input_csv_for_year(year: int) -> Path:
    return Path(f"Statcast_{year}") / f"Statcast_{year}_All.csv"


def output_dir_for_years(years):
    if len(years) == 1:
        return Path(f"Statcast_{years[0]}") / "ev_la_table"
    return Path("Statcast_Combined") / "ev_la_table"


def clamp_int(value, minimum, maximum):
    return max(minimum, min(maximum, int(round(value))))


def make_ev_key(ev: float) -> int:
    return clamp_int(ev, EV_MIN, EV_MAX)


def make_la_key(la: float) -> int:
    return clamp_int(la, LA_MIN, LA_MAX)


def classify_result(event: str) -> str:
    event = str(event)

    if event == "single":
        return "single"
    if event == "double":
        return "double"
    if event == "triple":
        return "triple"
    if event == "home_run":
        return "home_run"

    return "out"


def bases_for_result(result: str) -> int:
    return {
        "single": 1,
        "double": 2,
        "triple": 3,
        "home_run": 4,
        "out": 0,
    }[result]


def sample_quality(n):
    if n >= GOOD_SAMPLE_MIN:
        return "good"
    if n >= LOW_SAMPLE_MIN:
        return "low_sample"
    if n > 0:
        return "very_low_sample"
    return "none"


def load_statcast_frames(years):
    frames = []

    for year in years:
        input_csv = input_csv_for_year(year)
        if not input_csv.exists():
            raise FileNotFoundError(
                f"Statcast CSV not found for season {year}: {input_csv}. "
                f"Run download_statcast.py --years {year} first."
            )

        print(f"Reading: {input_csv}")
        try:
            frames.append(pd.read_csv(input_csv))
        except Exception as exc:
            raise RuntimeError(f"Failed to read Statcast CSV for season {year}: {input_csv}") from exc

    return pd.concat(frames, ignore_index=True)


def build_grouped_lookup(df):
    df = df[
        df["launch_speed"].notna()
        & df["launch_angle"].notna()
        & df["events"].notna()
    ].copy()

    df["ev"] = df["launch_speed"].astype(float)
    df["la"] = df["launch_angle"].astype(float)
    df["ev_key"] = df["ev"].apply(make_ev_key)
    df["la_key"] = df["la"].apply(make_la_key)

    df["result_type"] = df["events"].apply(classify_result)
    df["is_hit"] = df["result_type"].isin(
        ["single", "double", "triple", "home_run"]
    ).astype(int)
    df["is_single"] = (df["result_type"] == "single").astype(int)
    df["is_double"] = (df["result_type"] == "double").astype(int)
    df["is_triple"] = (df["result_type"] == "triple").astype(int)
    df["is_hr"] = (df["result_type"] == "home_run").astype(int)
    df["bases"] = df["result_type"].apply(bases_for_result)

    grouped = (
        df.groupby(["ev_key", "la_key"], as_index=False)
        .agg(
            batted_balls=("events", "count"),
            hits=("is_hit", "sum"),
            singles=("is_single", "sum"),
            doubles=("is_double", "sum"),
            triples=("is_triple", "sum"),
            hrs=("is_hr", "sum"),
            total_bases=("bases", "sum"),
            avg_ev=("ev", "mean"),
            avg_la=("la", "mean"),
        )
    )

    grouped["outs"] = grouped["batted_balls"] - grouped["hits"]
    grouped["ba"] = grouped["hits"] / grouped["batted_balls"]
    grouped["single_rate"] = grouped["singles"] / grouped["batted_balls"]
    grouped["double_rate"] = grouped["doubles"] / grouped["batted_balls"]
    grouped["triple_rate"] = grouped["triples"] / grouped["batted_balls"]
    grouped["hr_rate"] = grouped["hrs"] / grouped["batted_balls"]
    grouped["out_rate"] = grouped["outs"] / grouped["batted_balls"]
    grouped["slg"] = grouped["total_bases"] / grouped["batted_balls"]
    grouped["sample_quality"] = grouped["batted_balls"].apply(sample_quality)

    return df, grouped


def fill_full_grid(grouped):
    full_grid = pd.MultiIndex.from_product(
        [range(EV_MIN, EV_MAX + 1), range(LA_MIN, LA_MAX + 1)],
        names=["ev_key", "la_key"],
    ).to_frame(index=False)

    grouped = full_grid.merge(grouped, on=["ev_key", "la_key"], how="left")

    count_columns = [
        "batted_balls",
        "hits",
        "singles",
        "doubles",
        "triples",
        "hrs",
        "total_bases",
        "outs",
    ]
    rate_columns = [
        "ba",
        "single_rate",
        "double_rate",
        "triple_rate",
        "hr_rate",
        "out_rate",
        "slg",
    ]

    grouped[count_columns] = grouped[count_columns].fillna(0).astype(int)
    grouped[rate_columns] = grouped[rate_columns].fillna(0.0)
    grouped["avg_ev"] = grouped["avg_ev"].fillna(grouped["ev_key"])
    grouped["avg_la"] = grouped["avg_la"].fillna(grouped["la_key"])
    grouped["sample_quality"] = grouped["sample_quality"].fillna("none")
    grouped["ev_bin"] = grouped["ev_key"].astype(str)
    grouped["la_bin"] = grouped["la_key"].astype(str)

    return grouped.sort_values(["ev_key", "la_key"])


def row_to_lookup_entry(row):
    return {
        "ev": int(row["ev_key"]),
        "la": int(row["la_key"]),
        "evBin": row["ev_bin"],
        "laBin": row["la_bin"],
        "battedBalls": int(row["batted_balls"]),
        "hits": int(row["hits"]),
        "singles": int(row["singles"]),
        "doubles": int(row["doubles"]),
        "triples": int(row["triples"]),
        "hrs": int(row["hrs"]),
        "outs": int(row["outs"]),
        "ba": round(float(row["ba"]), 3),
        "slg": round(float(row["slg"]), 3),
        "singleRate": round(float(row["single_rate"]), 4),
        "doubleRate": round(float(row["double_rate"]), 4),
        "tripleRate": round(float(row["triple_rate"]), 4),
        "hrRate": round(float(row["hr_rate"]), 4),
        "outRate": round(float(row["out_rate"]), 4),
        "avgEv": round(float(row["avg_ev"]), 1),
        "avgLa": round(float(row["avg_la"]), 1),
        "sampleQuality": row["sample_quality"],
    }


def main():
    args = parse_args()
    years = sorted(set(args.years))
    output_dir = Path(args.output_dir) if args.output_dir else output_dir_for_years(years)
    output_dir.mkdir(parents=True, exist_ok=True)

    output_csv = output_dir / "ev_la_lookup.csv"
    output_json = output_dir / "ev_la_lookup.json"

    raw_df = load_statcast_frames(years)
    filtered_df, grouped = build_grouped_lookup(raw_df)
    grouped = fill_full_grid(grouped)

    grouped.to_csv(output_csv, index=False, encoding="utf-8-sig")

    lookup = {}
    for _, row in grouped.iterrows():
        key = f'{int(row["ev_key"])}|{int(row["la_key"])}'
        lookup[key] = row_to_lookup_entry(row)

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(lookup, f, ensure_ascii=False, indent=2)

    copied_json = None
    if args.copy_to_data:
        copied_json = Path("data") / "ev_la_lookup.json"
        copied_json.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output_json, copied_json)

    print("=" * 50)
    print("EV/LA lookup complete")
    print(f"Years: {', '.join(str(year) for year in years)}")
    print(f"CSV : {output_csv}")
    print(f"JSON: {output_json}")
    if copied_json:
        print(f"Copied game JSON: {copied_json}")
    print(f"Grid cells: {len(grouped):,}")
    print(f"Batted balls: {len(filtered_df):,}")


if __name__ == "__main__":
    main()
