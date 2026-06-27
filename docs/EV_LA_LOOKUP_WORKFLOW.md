# EV/LA Lookup Workflow

Use this flow when rebuilding the game lookup from multiple Statcast seasons.

## 1. Download multiple Statcast seasons

```powershell
python download_statcast.py --years 2019 2020 2021 2022 2023 2024 2025
```

Output:

- `Statcast_YYYY/YYYY-MM-DD_YYYY-MM-DD.csv`
- `Statcast_YYYY/Statcast_YYYY_All.csv`

Monthly CSV files are reused when they already exist. Add `--force` to redownload
and overwrite them.

## 2. Rebuild the EV/LA lookup

```powershell
python build_ev_la_table.py --years 2019 2020 2021 2022 2023 2024 2025
```

Output:

- `Statcast_Combined/ev_la_table/ev_la_lookup.csv`
- `Statcast_Combined/ev_la_table/ev_la_lookup.json`

The lookup keeps the `EV|LA` key format, for example `95|21`. It outputs every
EV cell from `50` to `120` and every LA cell from `-90` to `90`. Empty cells use
`battedBalls: 0` and `sampleQuality: "none"`.

## 3. Copy the lookup into the game

The game reads:

```text
data/ev_la_lookup.json
```

Use `--copy-to-data` to update it while rebuilding:

```powershell
python build_ev_la_table.py --years 2019 2020 2021 2022 2023 2024 2025 --copy-to-data
```

## 4. Verify in Live Server

Start the app with Live Server and play until a fair batted ball appears.

Check the batted-ball log for the lookup source, key, and sample quality:

```text
ev_la_lookup / 95|21 / good
```

The goal of using 2019-2025 data is to reduce `low_sample` and `none` cells and
increase `good` cells.

## Git note

Large Statcast folders are ignored by `.gitignore`:

```text
Statcast_*/
Statcast_Combined/
```
