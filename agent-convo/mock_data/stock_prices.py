MONTHS = [
    "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11",
    "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05",
]

STOCK_DATA = {
    "apple": {
        "ticker": "AAPL",
        "company": "Apple Inc.",
        "prices": [195.42, 198.17, 201.53, 197.88, 204.21, 209.67,
                   213.44, 208.92, 211.35, 215.78, 212.44, 218.93],
    },
    "microsoft": {
        "ticker": "MSFT",
        "company": "Microsoft Corporation",
        "prices": [415.20, 421.85, 418.37, 425.62, 431.44, 438.71,
                   445.23, 440.88, 448.15, 452.37, 449.92, 457.11],
    },
    "google": {
        "ticker": "GOOGL",
        "company": "Alphabet Inc.",
        "prices": [175.34, 178.92, 176.45, 181.23, 184.67, 188.91,
                   191.45, 187.23, 190.56, 193.78, 191.22, 196.44],
    },
    "amazon": {
        "ticker": "AMZN",
        "company": "Amazon.com Inc.",
        "prices": [190.45, 194.23, 197.88, 193.44, 199.67, 205.23,
                   210.88, 206.34, 209.77, 213.45, 210.88, 216.33],
    },
    "meta": {
        "ticker": "META",
        "company": "Meta Platforms Inc.",
        "prices": [545.33, 552.18, 558.77, 549.22, 562.88, 571.45,
                   579.33, 567.88, 575.22, 583.44, 578.92, 592.11],
    },
    "tesla": {
        "ticker": "TSLA",
        "company": "Tesla Inc.",
        "prices": [245.67, 238.44, 251.23, 243.88, 258.44, 265.23,
                   271.88, 255.44, 262.77, 275.33, 259.88, 268.44],
    },
    "nvidia": {
        "ticker": "NVDA",
        "company": "NVIDIA Corporation",
        "prices": [875.44, 912.33, 948.77, 921.44, 977.88, 1023.45,
                   1067.22, 1034.88, 1078.33, 1112.44, 1089.77, 1145.22],
    },
}

ALIASES = {
    "aapl": "apple",
    "msft": "microsoft",
    "googl": "google",
    "goog": "google",
    "alphabet": "google",
    "amzn": "amazon",
    "facebook": "meta",
    "fb": "meta",
    "tsla": "tesla",
    "nvda": "nvidia",
}
