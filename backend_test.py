"""
Smoke test for the running API (start it first with `bash launch.sh`).

    python3 backend_test.py [base_url]

Checks every endpoint the frontend calls and exits non-zero on the first failure.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001") + "/api"


def get(path):
    """GET a path and return (status, parsed JSON body)."""
    try:
        with urllib.request.urlopen(BASE + path, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def main():
    status, body = get("/health")
    assert status == 200 and body["status"] == "healthy", body

    status, body = get("/countries")
    gb = next(c for c in body["countries"] if c["code"] == "gb")
    assert gb == {"code": "gb", "name": "United Kingdom", "flag": "🇬🇧"}, gb

    status, body = get("/indicators")
    ids = [i["id"] for i in body["indicators"]]
    assert ids == ["liberal", "gender_inequality", "populism", "combined"], ids

    for indicator_id in ids:
        status, body = get(f"/indicators/{indicator_id}")
        values = body["data"].values()
        assert status == 200 and values, indicator_id
        assert all(0 <= v["value"] <= 1 for v in values), indicator_id
        assert "hkg" not in body["data"], "ISO-3 code leaked through"
        print(f"ok  /indicators/{indicator_id}: {len(body['data'])} countries")

    status, _ = get("/indicators/nope")
    assert status == 404

    # Live NewsData.io call: 200 with articles, or 502/503 with a readable error.
    status, body = get("/news/gb?indicator=liberal&page_size=5")
    assert status in (200, 502, 503), status
    if status == 200:
        assert body["country_name"] == "United Kingdom" and len(body["articles"]) <= 5
        print(f"ok  /news/gb: {len(body['articles'])} articles")
    else:
        print(f"warn /news/gb: {status} {body['detail']}")

    print("All API checks passed")


if __name__ == "__main__":
    main()
