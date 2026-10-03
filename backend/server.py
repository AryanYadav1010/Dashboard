"""
Rebalance Global Observatory - API server.

Serves three country-level indicators (plus a combined index) from JSON files
loaded at startup, and proxies country news from NewsData.io.

Run:  uvicorn server:app --port 8001     (or `bash launch.sh` from the repo root)
Docs: http://localhost:8001/docs
"""
import json
import logging
import os
import ssl
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import aiohttp
import certifi
import pycountry
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

NEWSDATA_KEY = os.environ.get("NEWSDATA_KEY", "")
NEWSDATA_URL = "https://newsdata.io/api/1/news"


# ---------------------------------------------------------------------------
# Countries
# ---------------------------------------------------------------------------

# ISO 3166-1 alpha-2 code -> display name (shorter names than pycountry's official ones).
COUNTRY_NAMES = {
    "af": "Afghanistan", "al": "Albania", "dz": "Algeria",
    "ad": "Andorra", "ao": "Angola", "ar": "Argentina",
    "am": "Armenia", "au": "Australia", "at": "Austria",
    "az": "Azerbaijan", "bs": "Bahamas", "bh": "Bahrain",
    "bd": "Bangladesh", "by": "Belarus", "be": "Belgium",
    "bz": "Belize", "bj": "Benin", "bt": "Bhutan",
    "bo": "Bolivia", "ba": "Bosnia and Herzegovina", "bw": "Botswana",
    "br": "Brazil", "bn": "Brunei", "bg": "Bulgaria",
    "bf": "Burkina Faso", "bi": "Burundi", "kh": "Cambodia",
    "cm": "Cameroon", "ca": "Canada", "cv": "Cape Verde",
    "cf": "Central African Republic", "td": "Chad", "cl": "Chile",
    "cn": "China", "co": "Colombia", "km": "Comoros",
    "cg": "Congo", "cd": "DR Congo", "cr": "Costa Rica",
    "ci": "Ivory Coast", "hr": "Croatia", "cu": "Cuba",
    "cy": "Cyprus", "cz": "Czech Republic", "dk": "Denmark",
    "dj": "Djibouti", "do": "Dominican Republic", "ec": "Ecuador",
    "eg": "Egypt", "sv": "El Salvador", "gq": "Equatorial Guinea",
    "er": "Eritrea", "ee": "Estonia", "sz": "Eswatini",
    "et": "Ethiopia", "fj": "Fiji", "fi": "Finland",
    "fr": "France", "ga": "Gabon", "gm": "Gambia",
    "ge": "Georgia", "de": "Germany", "gh": "Ghana",
    "gr": "Greece", "gd": "Grenada", "gt": "Guatemala",
    "gn": "Guinea", "gw": "Guinea-Bissau", "gy": "Guyana",
    "ht": "Haiti", "hn": "Honduras", "hu": "Hungary",
    "is": "Iceland", "in": "India", "id": "Indonesia",
    "ir": "Iran", "iq": "Iraq", "ie": "Ireland",
    "il": "Israel", "it": "Italy", "jm": "Jamaica",
    "jp": "Japan", "jo": "Jordan", "kz": "Kazakhstan",
    "ke": "Kenya", "ki": "Kiribati", "kp": "North Korea",
    "kr": "South Korea", "kw": "Kuwait", "kg": "Kyrgyzstan",
    "la": "Laos", "lv": "Latvia", "lb": "Lebanon",
    "ls": "Lesotho", "lr": "Liberia", "ly": "Libya",
    "li": "Liechtenstein", "lt": "Lithuania", "lu": "Luxembourg",
    "mg": "Madagascar", "mw": "Malawi", "my": "Malaysia",
    "mv": "Maldives", "ml": "Mali", "mt": "Malta",
    "mh": "Marshall Islands", "mr": "Mauritania", "mu": "Mauritius",
    "mx": "Mexico", "fm": "Micronesia", "md": "Moldova",
    "mc": "Monaco", "mn": "Mongolia", "me": "Montenegro",
    "ma": "Morocco", "mz": "Mozambique", "mm": "Myanmar",
    "na": "Namibia", "nr": "Nauru", "np": "Nepal",
    "nl": "Netherlands", "nz": "New Zealand", "ni": "Nicaragua",
    "ne": "Niger", "ng": "Nigeria", "mk": "North Macedonia",
    "no": "Norway", "om": "Oman", "pk": "Pakistan",
    "pw": "Palau", "ps": "Palestine", "pa": "Panama",
    "pg": "Papua New Guinea", "py": "Paraguay", "pe": "Peru",
    "ph": "Philippines", "pl": "Poland", "pt": "Portugal",
    "qa": "Qatar", "ro": "Romania", "ru": "Russia",
    "rw": "Rwanda", "kn": "Saint Kitts and Nevis", "lc": "Saint Lucia",
    "vc": "Saint Vincent and the Grenadines", "ws": "Samoa", "sm": "San Marino",
    "st": "Sao Tome and Principe", "sa": "Saudi Arabia", "sn": "Senegal",
    "rs": "Serbia", "sc": "Seychelles", "sl": "Sierra Leone",
    "sg": "Singapore", "sk": "Slovakia", "si": "Slovenia",
    "sb": "Solomon Islands", "so": "Somalia", "za": "South Africa",
    "ss": "South Sudan", "es": "Spain", "lk": "Sri Lanka",
    "sd": "Sudan", "sr": "Suriname", "se": "Sweden",
    "ch": "Switzerland", "sy": "Syria", "tw": "Taiwan",
    "tj": "Tajikistan", "tz": "Tanzania", "th": "Thailand",
    "tl": "Timor-Leste", "tg": "Togo", "to": "Tonga",
    "tt": "Trinidad and Tobago", "tn": "Tunisia", "tr": "Turkey",
    "tm": "Turkmenistan", "tv": "Tuvalu", "ug": "Uganda",
    "ua": "Ukraine", "ae": "United Arab Emirates", "gb": "United Kingdom",
    "us": "United States", "uy": "Uruguay", "uz": "Uzbekistan",
    "vu": "Vanuatu", "va": "Vatican City", "ve": "Venezuela",
    "vn": "Vietnam", "ye": "Yemen", "zm": "Zambia",
    "zw": "Zimbabwe",}


def flag_emoji(code: str) -> str:
    """'gb' -> '🇬🇧' (each letter maps to a Unicode regional-indicator symbol)."""
    return "".join(chr(0x1F1E6 + ord(c) - ord("a")) for c in code.lower())


def alpha3_to_alpha2(code: str) -> str:
    """'GBR' -> 'gb'. Data files are keyed by ISO-3, the frontend map uses ISO-2."""
    country = pycountry.countries.get(alpha_3=code)
    return country.alpha_2.lower() if country else code.lower()


# ---------------------------------------------------------------------------
# Indicators
# ---------------------------------------------------------------------------

# lower_is_better tells the frontend which way to colour and sort each indicator.
INDICATOR_METADATA = {
    "liberal": {
        "name": "Liberal Democracy",
        "description": "Measures liberal democracy based on civil liberties and rule of law",
        "source": "V-Dem v2x_liberal",
        "lower_is_better": False,
    },
    "gender_inequality": {
        "name": "Gender Inequality",
        "description": "Gender Inequality Index (GII) - lower values mean less inequality",
        "source": "UNDP HDR 2023",
        "lower_is_better": True,
    },
    "populism": {
        "name": "Populism",
        "description": "Weighted populism score based on party populism and vote share",
        "source": "Global Party Survey 2020",
        "lower_is_better": True,
    },
    "combined": {
        "name": "Combined Index",
        "description": "Combined score from Liberal Democracy, Gender Equality, and Low Populism",
        "source": "Composite Index",
        "lower_is_better": False,
    },
}

# Each file maps ISO-3 code -> {"name", "value" (0-1), "year"}.
INDICATOR_FILES = {
    "liberal": "liberal_index.json",
    "gender_inequality": "gender_inequality_index.json",
    "populism": "populism_index.json",
}


def load_indicators() -> dict:
    data = {}
    for key, filename in INDICATOR_FILES.items():
        with open(ROOT_DIR / filename) as f:
            data[key] = json.load(f)
        logger.info(f"Loaded {key} data for {len(data[key])} countries")
    data["combined"] = build_combined(data["liberal"], data["gender_inequality"], data["populism"])
    logger.info(f"Built combined index for {len(data['combined'])} countries")
    return data


def build_combined(liberal: dict, gender: dict, populism: dict) -> dict:
    """
    Combined = mean(liberal, 1 - gender_inequality, 1 - populism), so higher is better.
    Only countries present in all three datasets are scored.
    """
    combined = {}
    for code in liberal.keys() & gender.keys() & populism.keys():
        scores = [liberal[code]["value"], 1 - gender[code]["value"], 1 - populism[code]["value"]]
        combined[code] = {
            "name": liberal[code]["name"],
            "value": round(sum(scores) / 3, 3),
            "year": 2024,
        }
    return combined


INDICATORS_DATA = load_indicators()


# ---------------------------------------------------------------------------
# News (NewsData.io)
# ---------------------------------------------------------------------------

# Topic filter added to the news query for each indicator. The free tier caps the
# whole `q` string (country name included) at 100 characters, so keep these short.
INDICATOR_KEYWORDS = {
    "liberal": 'democracy OR "civil liberties" OR economy OR business',
    "gender_inequality": '"gender equality" OR "women\'s rights" OR economy',
    "populism": 'populism OR "far right" OR economy OR business',
    "combined": "governance OR democracy OR economy OR business",
}


class ArticleSource(BaseModel):
    id: Optional[str] = None
    name: str


class Article(BaseModel):
    source: ArticleSource
    author: Optional[str] = None
    title: str
    description: Optional[str] = None
    url: str
    urlToImage: Optional[str] = None
    publishedAt: str
    content: Optional[str] = None


class NewsResponse(BaseModel):
    status: str
    total_results: int
    articles: List[Article]
    country_name: str
    country_flag: str


def to_article(item: dict) -> Article:
    """Map a NewsData.io result onto the article shape the frontend renders."""
    creators = item.get("creator")
    return Article(
        source=ArticleSource(id=item.get("source_id"), name=item.get("source_id") or "Unknown Source"),
        author=creators[0] if isinstance(creators, list) and creators else None,
        title=item.get("title") or "No Title",
        description=item.get("description"),
        url=item.get("link") or "#",
        urlToImage=item.get("image_url"),
        publishedAt=item.get("pubDate") or datetime.now(timezone.utc).isoformat(),
        content=item.get("content"),
    )


# ---------------------------------------------------------------------------
# App + routes
# ---------------------------------------------------------------------------

http: Optional[aiohttp.ClientSession] = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Open one shared HTTP session for outbound news calls; close it on shutdown."""
    global http
    ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    http = aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=30),
        connector=aiohttp.TCPConnector(ssl=ssl_ctx),
    )
    yield
    await http.close()


app = FastAPI(title="Rebalance Global Observatory API", version="1.0.0", lifespan=lifespan)
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


@api.get("/countries")
async def list_countries():
    """All countries for the search box, sorted by name."""
    return {
        "countries": [
            {"code": code, "name": name, "flag": flag_emoji(code)}
            for code, name in sorted(COUNTRY_NAMES.items(), key=lambda item: item[1])
        ]
    }


@api.get("/indicators")
async def list_indicators():
    return {"indicators": [{"id": key, **meta} for key, meta in INDICATOR_METADATA.items()]}


@api.get("/indicators/{indicator_id}")
async def get_indicator(indicator_id: str):
    """One indicator's values, keyed by ISO-2 code so they line up with the map."""
    if indicator_id not in INDICATORS_DATA:
        raise HTTPException(status_code=404, detail=f"Indicator '{indicator_id}' not found")

    meta = INDICATOR_METADATA[indicator_id]
    return {
        "data": {
            alpha3_to_alpha2(code): {"name": row["name"], "value": row["value"], "year": row["year"]}
            for code, row in INDICATORS_DATA[indicator_id].items()
        },
        "metadata": {
            "id": indicator_id,
            "name": meta["name"],
            "description": meta["description"],
            "source": meta["source"],
            "scale": {"min": 0, "max": 1},
        },
    }


@api.get("/news/{country_code}", response_model=NewsResponse)
async def get_country_news(
    country_code: str,
    indicator: Optional[str] = Query(None, description="Indicator id; narrows news to that topic"),
    page_size: int = Query(10, ge=1, le=50),
):
    """Latest English news for one country, optionally filtered to an indicator's topic."""
    code = country_code.lower()
    name = COUNTRY_NAMES.get(code, code.upper())
    if not NEWSDATA_KEY:
        raise HTTPException(status_code=503, detail="News is unavailable: NEWSDATA_KEY is not configured")

    query = f'"{name}"'
    if indicator in INDICATOR_KEYWORDS:
        query += f" AND ({INDICATOR_KEYWORDS[indicator]})"
    params = {"apikey": NEWSDATA_KEY, "q": query, "language": "en", "country": code}

    try:
        async with http.get(NEWSDATA_URL, params=params) as response:
            data = await response.json(content_type=None)
    except Exception as e:
        logger.error(f"NewsData.io request failed for {name}: {e}")
        raise HTTPException(status_code=502, detail="Could not reach the news service")

    if response.status != 200 or data.get("status") != "success":
        message = (data.get("results") or {}).get("message", f"HTTP {response.status}")
        logger.error(f"NewsData.io error for {name}: {message}")
        raise HTTPException(status_code=502, detail=f"News service error: {message}")

    articles = [to_article(item) for item in data.get("results", [])][:page_size]
    return NewsResponse(
        status="ok",
        total_results=data.get("totalResults", len(articles)),
        articles=articles,
        country_name=name,
        country_flag=flag_emoji(code) if code in COUNTRY_NAMES else "",
    )


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
