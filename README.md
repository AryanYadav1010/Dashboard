# Rebalance Global Observatory

Interactive world map of country-level governance indicators, with a ranked list and
per-country news filtered to the selected indicator's topic.

| Indicator | Source | Better when |
|---|---|---|
| Liberal Democracy | V-Dem `v2x_liberal` | higher |
| Gender Inequality | UNDP HDR 2023 (GII) | lower |
| Populism | Global Party Survey 2020 | lower |
| Combined Index | mean of the three (inequality and populism inverted) | higher |

## Run locally

```bash
bash launch.sh        # starts backend :8001 + frontend :3000 and opens the browser
bash launch.sh stop
```

First-time setup:

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env      # add your NewsData.io key
cd frontend && yarn install
```

Check the API while it is running: `python3 backend_test.py`

## Layout

```
backend/
  server.py                     FastAPI app: indicator data + NewsData.io news proxy
  *_index.json                  indicator values by ISO-3 code (0-1 scale)
  gender_inequality.csv, *.xlsx raw source data
frontend/src/
  App.js                        layout and shared state (selected indicator / country)
  components/WorldMap.jsx       choropleth map + legend
  components/RankingPanel.jsx   sorted, filterable country list
  components/CountryPanel.jsx   slide-out score + news panel
  components/CountrySearch.jsx  search box
  lib/                          API base URL, colour scale, map-id -> country-code table
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/health` | liveness check |
| `GET /api/countries` | countries for search (code, name, flag) |
| `GET /api/indicators` | indicator list and metadata |
| `GET /api/indicators/{id}` | values keyed by ISO-2 code |
| `GET /api/news/{code}?indicator=&page_size=` | latest news for a country |

Interactive docs: http://localhost:8001/docs
