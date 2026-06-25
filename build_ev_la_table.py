import json
from pathlib import Path

import pandas as pd


YEAR = 2025

INPUT_CSV = Path(f"Statcast_{YEAR}") / f"Statcast_{YEAR}_All.csv"
OUTPUT_DIR = Path(f"Statcast_{YEAR}") / "ev_la_table"
OUTPUT_DIR.mkdir(exist_ok=True)

OUTPUT_CSV = OUTPUT_DIR / "ev_la_lookup.csv"
OUTPUT_JSON = OUTPUT_DIR / "ev_la_lookup.json"


def make_ev_bin(ev: float) -> str:
    if ev < 50:
        return "under_50"
    if ev >= 120:
        return "120_plus"

    lower = int(ev // 5 * 5)
    upper = lower + 5
    return f"{lower}_{upper}"


def make_la_bin(la: float) -> str:
    if la < -60:
        return "under_-60"
    if la >= 70:
        return "70_plus"

    lower = int(la // 5 * 5)
    upper = lower + 5
    return f"{lower}_{upper}"


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


def main():
    print(f"読み込み中: {INPUT_CSV}")

    df = pd.read_csv(INPUT_CSV)

    # EV / LA / events がある打球だけ使う
    df = df[
        df["launch_speed"].notna()
        & df["launch_angle"].notna()
        & df["events"].notna()
    ].copy()

    df["ev"] = df["launch_speed"].astype(float)
    df["la"] = df["launch_angle"].astype(float)

    df["ev_bin"] = df["ev"].apply(make_ev_bin)
    df["la_bin"] = df["la"].apply(make_la_bin)

    df["result_type"] = df["events"].apply(classify_result)
    df["is_hit"] = df["result_type"].isin(["single", "double", "triple", "home_run"]).astype(int)
    df["is_single"] = (df["result_type"] == "single").astype(int)
    df["is_double"] = (df["result_type"] == "double").astype(int)
    df["is_triple"] = (df["result_type"] == "triple").astype(int)
    df["is_hr"] = (df["result_type"] == "home_run").astype(int)
    df["bases"] = df["result_type"].apply(bases_for_result)

    grouped = (
        df.groupby(["ev_bin", "la_bin"], as_index=False)
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

    # 少なすぎるマスはゲームで不安定なので、いったん確認しやすいように残す
    grouped["sample_quality"] = grouped["batted_balls"].apply(
        lambda n: "good" if n >= 100 else "low_sample"
    )

    grouped = grouped.sort_values(["ev_bin", "la_bin"])

    grouped.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")

    lookup = {}

    for _, row in grouped.iterrows():
        key = f'{row["ev_bin"]}|{row["la_bin"]}'

        lookup[key] = {
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

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(lookup, f, ensure_ascii=False, indent=2)

    print("=" * 50)
    print("EV×LAテーブル作成完了")
    print(f"CSV : {OUTPUT_CSV}")
    print(f"JSON: {OUTPUT_JSON}")
    print(f"マス数: {len(grouped):,}")
    print(f"総打球数: {len(df):,}")


if __name__ == "__main__":
    main()