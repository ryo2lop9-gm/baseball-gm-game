from pybaseball import statcast
import pandas as pd
import time
from pathlib import Path

YEAR = 2025

# 保存先フォルダ
output_dir = Path(f"Statcast_{YEAR}")
output_dir.mkdir(exist_ok=True)

# 月ごとに取得（37日制限対策）
months = [
    ("2025-03-01", "2025-03-31"),
    ("2025-04-01", "2025-04-30"),
    ("2025-05-01", "2025-05-31"),
    ("2025-06-01", "2025-06-30"),
    ("2025-07-01", "2025-07-31"),
    ("2025-08-01", "2025-08-31"),
    ("2025-09-01", "2025-09-30"),
]

all_data = []

for start, end in months:

    print("=" * 50)
    print(f"{start} ～ {end} を取得中")

    df = statcast(start_dt=start, end_dt=end)

    # 打球だけ抽出
    df = df[
        df["launch_speed"].notna()
        & df["launch_angle"].notna()
    ].copy()

    filename = output_dir / f"{start}_{end}.csv"

    df.to_csv(
        filename,
        index=False,
        encoding="utf-8-sig"
    )

    print(f"{len(df):,} 打球保存")
    print(filename)

    all_data.append(df)

    time.sleep(3)

# 全期間結合
all_df = pd.concat(all_data, ignore_index=True)

all_filename = output_dir / f"Statcast_{YEAR}_All.csv"

all_df.to_csv(
    all_filename,
    index=False,
    encoding="utf-8-sig"
)

print("=" * 50)
print("全データ保存完了")
print(f"総打球数：{len(all_df):,}")
print(all_filename)