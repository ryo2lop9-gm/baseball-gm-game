import argparse
import calendar
import time
from datetime import date
from pathlib import Path

import pandas as pd
from pybaseball import statcast


DEFAULT_YEARS = [2025]
SEASON_MONTHS = range(3, 10)


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


def batted_balls_only(df):
    return df[df["launch_speed"].notna() & df["launch_angle"].notna()].copy()


def download_month(year, start, end, output_dir, force):
    filename = output_dir / f"{start}_{end}.csv"

    if filename.exists() and not force:
        print(f"Using cached: {filename}")
        return pd.read_csv(filename)

    print("=" * 50)
    print(f"Downloading {start} to {end}")
    df = statcast(start_dt=start, end_dt=end)
    df = batted_balls_only(df)
    df.to_csv(filename, index=False, encoding="utf-8-sig")
    print(f"Saved {len(df):,} batted balls: {filename}")
    return df


def download_year(year, sleep_seconds, force):
    output_dir = Path(f"Statcast_{year}")
    output_dir.mkdir(exist_ok=True)

    all_data = []
    for month in SEASON_MONTHS:
        start, end = month_range(year, month)
        df = download_month(year, start, end, output_dir, force)
        all_data.append(df)
        time.sleep(sleep_seconds)

    all_df = pd.concat(all_data, ignore_index=True)
    all_filename = output_dir / f"Statcast_{year}_All.csv"
    all_df.to_csv(all_filename, index=False, encoding="utf-8-sig")

    print("=" * 50)
    print(f"Saved season {year}: {len(all_df):,} batted balls")
    print(all_filename)


def main():
    args = parse_args()

    for year in sorted(set(args.years)):
        download_year(year, args.sleep, args.force)


if __name__ == "__main__":
    main()
