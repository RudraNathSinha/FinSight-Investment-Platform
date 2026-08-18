"""Country name normalization used across FinSight."""
CANONICAL = {
    "korea, rep.": "South Korea", "korea, rep": "South Korea", "korea": "South Korea",
    "republic of korea": "South Korea", "south korea": "South Korea",
    "hong kong sar, china": "Hong Kong", "hong kong sar": "Hong Kong", "hong kong, china": "Hong Kong",
    "hong kong": "Hong Kong",
    "turkiye": "Turkey", "türkiye": "Turkey", "turkey": "Turkey",
    "viet nam": "Vietnam", "vietnam": "Vietnam",
    "egypt, arab rep.": "Egypt", "egypt, arab rep": "Egypt", "egypt": "Egypt",
    "russian federation": "Russia", "russia": "Russia",
    "czechia": "Czech Republic", "czech republic": "Czech Republic",
    "west africa": "Cote d'Ivoire", "ivory coast": "Cote d'Ivoire", "côte d'ivoire": "Cote d'Ivoire",
    "cote d'ivoire": "Cote d'Ivoire", "cote divoire": "Cote d'Ivoire",
    "west bank and gaza": "Palestine", "palestine": "Palestine", "gaza": "Palestine",
    "venezuela, rb": "Venezuela", "venezuela rb": "Venezuela", "venezuela": "Venezuela",
    "slovak republic": "Slovakia", "slovakia": "Slovakia",
    "taiwan": "Taiwan", "taiwan, china": "Taiwan",
    "lithuania": "Lithuania", "latvia": "Latvia",
}

CANONICAL_TO_ISO3 = {
    "South Korea": "KOR", "Hong Kong": "HKG", "Turkey": "TUR", "Vietnam": "VNM",
    "Egypt": "EGY", "Russia": "RUS", "Czech Republic": "CZE", "Cote d'Ivoire": "CIV",
    "Palestine": "PSE", "Venezuela": "VEN", "Slovakia": "SVK", "Taiwan": "TWN",
    "Lithuania": "LTU", "Latvia": "LVA", "United States": "USA", "United Kingdom": "GBR",
    "India": "IND", "China": "CHN", "Japan": "JPN", "Germany": "DEU", "France": "FRA",
    "Canada": "CAN", "Australia": "AUS", "Brazil": "BRA", "Mexico": "MEX",
    "Singapore": "SGP", "Malaysia": "MYS", "Indonesia": "IDN", "Thailand": "THA",
    "Philippines": "PHL", "South Africa": "ZAF", "Saudi Arabia": "SAU",
    "United Arab Emirates": "ARE", "Israel": "ISR", "Poland": "POL", "Sweden": "SWE",
    "Norway": "NOR", "Switzerland": "CHE", "Netherlands": "NLD", "Spain": "ESP",
    "Italy": "ITA", "Argentina": "ARG", "Chile": "CHL", "Colombia": "COL",
    "Peru": "PER", "Nigeria": "NGA", "Kenya": "KEN", "Pakistan": "PAK",
    "Bangladesh": "BGD", "Sri Lanka": "LKA", "New Zealand": "NZL", "Greece": "GRC",
    "Hungary": "HUN", "Romania": "ROU", "Serbia": "SRB", "Austria": "AUT",
    "Belgium": "BEL", "Ireland": "IRL", "Denmark": "DNK", "Finland": "FIN",
    "Iceland": "ISL", "Portugal": "PRT", "Qatar": "QAT", "Kuwait": "KWT",
    "Bahrain": "BHR", "Oman": "OMN", "Jordan": "JOR", "Morocco": "MAR",
    "Tunisia": "TUN", "Ghana": "GHA", "Uganda": "UGA", "Tanzania": "TZA",
    "Zambia": "ZMB", "Zimbabwe": "ZWE", "Botswana": "BWA", "Namibia": "NAM",
    "Malawi": "MWI", "Mauritius": "MUS", "Jamaica": "JAM", "Trinidad and Tobago": "TTO",
    "Kazakhstan": "KAZ", "Ukraine": "UKR", "Bulgaria": "BGR", "Croatia": "HRV",
    "Cyprus": "CYP", "Malta": "MLT", "Luxembourg": "LUX", "Slovenia": "SVN",
    "Lebanon": "LBN",
}

# World-Bank / ranking name -> canonical
RANKING_NAME_TO_CANONICAL = {
    "Korea, Rep.": "South Korea",
    "Hong Kong SAR, China": "Hong Kong",
    "Turkiye": "Turkey",
    "Viet Nam": "Vietnam",
    "Egypt, Arab Rep.": "Egypt",
    "Russian Federation": "Russia",
    "Czechia": "Czech Republic",
    "Cote d'Ivoire": "Cote d'Ivoire",
    "West Bank and Gaza": "Palestine",
    "Venezuela, RB": "Venezuela",
    "Slovak Republic": "Slovakia",
}

def normalize_country(name: str) -> str:
    if not name:
        return name
    s = name.strip()
    if s in RANKING_NAME_TO_CANONICAL:
        return RANKING_NAME_TO_CANONICAL[s]
    key = s.lower()
    return CANONICAL.get(key, s)

def country_to_iso3(name: str) -> str | None:
    canon = normalize_country(name)
    return CANONICAL_TO_ISO3.get(canon)

def ranking_iso_to_canonical(iso3: str, iso_meta: dict) -> str:
    meta = iso_meta.get(iso3) or {}
    raw = meta.get("country_name") or iso3
    return normalize_country(raw)
