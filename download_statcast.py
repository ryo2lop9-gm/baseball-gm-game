import argparse
import calendar
import time
from datetime import date
from pathlib import Path

import pandas as pd
from pybaseball import statcast


DEFAULT_YEARS = [2025]
SEASON_MONTHS = range(3, 10)
REQUIRED_BATTED_BALL_COLUMNS = ["launch_speed", "launch_angle"]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Download monthly Statcast batted-ball CSV files."
    )
    parser.add_argument(
        "--years",
        nargs="+",
        type=int,
        default=DEFAULT_YEARS,
        help="Seasons to download, for example: --years 2019 2020 2021",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=3.0,
        help="Seconds to wait between pybaseball requests.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Redownload monthly CSV files that already exist.",
    )
    return parser.parse_args()


def month_range(year, month):
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1).isoformat(), date(year, month, last_day).isoformat()


def has_batted_ball_columns(df):
    return all(column in df.columns for column in REQUIRED_BATTED_BALL_COLUMNS)


def log_no_batted_ball_data(year, start, end):
    print(f"No batted ball data for {year} {start} to {end}. Skipping.")


def batted_balls_only(df):
    if df.empty or not has_batted_ball_columns(df):
        return pd.DataFrame()

    return df[df["launch_speed"].notna() & df["launch_angle"].notna()].copy()


def download_month(year, start, end, output_dir, force):
    filename = output_dir / f"{start}_{end}.csv"

    if filename.exists() and not force:
        print(f"Using cached: {filename}")
        try:
            df = pd.read_csv(filename)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to read cached Statcast CSV for {year} {start} to {end}: "
                f"{filename}"
            ) from exc

        df = batted_balls_only(df)
        if df.empty:
            log_no_batted_ball_data(year, start, end)
            return None

        return df

    print("=" * 50)
    print(f"Downloading {year}: {start} to {end}")

    try:
        df = statcast(start_dt=start, end_dt=end)
        df = batted_balls_only(df)
        if df.empty:
            log_no_batted_ball_data(year, start, end)
            if force and filename.exists():
                filename.unlink()
            return None

        df.to_csv(filename, index=False, encoding="utf-8-sig")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to download/save Statcast data for {year} {start} to {end}: "
            f"{filename}"
        ) from exc

    print(f"Saved {len(df):,} batted balls: {filename}")
    return df


def download_year(year, sleep_seconds, force):
    output_dir = Path(f"Statcast_{year}")
    output_dir.mkdir(exist_ok=True)

    all_data = []
    for month in SEASON_MONTHS:
        start, end = month_range(year, month)
        print(f"Preparing {year}: {start} to {end}")
        df = download_month(year, start, end, output_dir, force)
        if df is not None and not df.empty:
            all_data.append(df)
        time.sleep(sleep_seconds)

    if not all_data:
        print("=" * 50)
        print(f"No batted ball CSVs found for season {year}. Skipping All CSV.")
        return

    all_df = pd.concat(all_data, ignore_index=True)
    all_filename = output_dir / f"Statcast_{year}_All.csv"
    try:
        all_df.to_csv(all_filename, index=False, encoding="utf-8-sig")
    except Exception as exc:
        raise RuntimeError(f"Failed to write combined Statcast CSV for {year}: {all_filename}") from exc

    print("=" * 50)
    print(f"Saved season {year}: {len(all_df):,} batted balls")
    print(all_filename)


def main():
    args = parse_args()

    for year in sorted(set(args.years)):
        try:
            download_year(year, args.sleep, args.force)
        except Exception as exc:
            print("=" * 50)
            print(f"ERROR while processing season {year}")
            print(str(exc))
            raise


if __name__ == "__main__":
    main()
