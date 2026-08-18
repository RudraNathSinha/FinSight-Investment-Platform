# FinSight — Live Market Data Coverage Report
Generated from sample-based yfinance probes across 116 exchanges.

## Executive summary
- Universe size: **83,132** unique listings
- Estimated **with** Yahoo Finance price data: **~67,912 (81.7%)**
- Estimated **without** (user sees “no data found”): **~15,220 (18.3%)**

## Important caveats
1. This is **sample-based** (4–8 random symbols per exchange), not a full 83k crawl (Yahoo rate-limits).
2. Some “0%” exchanges are **false negatives** from wrong ticker formats or rate limits; suffix/padding fixes were applied after this scan.
3. **No free API covers every global listing.** Micro-exchanges, suspended, and OTC pink-sheet names often have no Yahoo feed.
4. “Completing” 100% requires **paid** market-data licenses (Bloomberg, Refinitiv, Polygon, etc.).

## High coverage exchanges (users usually get data)
| Code | Stocks | Sample rate | Country |
|------|--------|-------------|---------|
| OTC | 10,719 | 100.0% | United States |
| FRA | 10,417 | 100.0% | Germany |
| BOM | 4,830 | 100.0% | India |
| TYO | 3,830 | 100.0% | Japan |
| NASDAQ | 3,420 | 100.0% | United States |
| LON | 3,321 | 83.3% | United Kingdom |
| NSE | 3,026 | 66.7% | India |
| HKG | 2,799 | 66.7% | Hong Kong |
| SHA | 2,353 | 100.0% | China |
| NYSE | 1,942 | 100.0% | United States |
| ASX | 1,816 | 100.0% | Australia |
| KOSDAQ | 1,796 | 100.0% | South Korea |
| TSXV | 1,557 | 100.0% | Canada |
| BKK | 1,320 | 100.0% | Thailand |
| ETR | 1,273 | 100.0% | Germany |
| TPEX | 1,251 | 100.0% | Taiwan |
| BIT | 1,106 | 100.0% | Italy |
| TPE | 1,101 | 100.0% | Taiwan |
| BVMF | 1,097 | 100.0% | Brazil |
| VIE | 1,065 | 100.0% | Austria |
| IDX | 914 | 100.0% | Indonesia |
| BMV | 843 | 100.0% | Mexico |
| KRX | 828 | 100.0% | South Korea |
| TSX | 816 | 100.0% | Canada |
| WSE | 761 | 83.3% | Poland |
| STO | 757 | 66.7% | Sweden |
| EPA | 720 | 100.0% | France |
| CSE | 685 | 100.0% | Canada |
| IST | 620 | 100.0% | Turkey |
| AIM | 596 | 100.0% | United Kingdom |
| BCBA | 541 | 100.0% | Argentina |
| TLV | 530 | 100.0% | Israel |
| SGX | 507 | 100.0% | Singapore |

## Low / zero sample coverage (highest risk of “no data found”)
~10,557 stocks sit on these venues.

| Code | Stocks | Rate | Country | Notes |
|------|--------|------|---------|-------|
| KLSE | 1,101 | 0.0% | Malaysia | suffix mapped; may still lack Yahoo coverage |
| SGXC | 507 | 0.0% | Singapore | no suffix map at scan time |
| SWX | 465 | 0.0% | Switzerland | suffix mapped; may still lack Yahoo coverage |
| HOSE | 402 | 0.0% | Vietnam | suffix mapped; may still lack Yahoo coverage |
| TADAWUL | 383 | 0.0% | Saudi Arabia | no suffix map at scan time |
| DSE | 357 | 0.0% | Bangladesh | suffix mapped; may still lack Yahoo coverage |
| COSE | 297 | 0.0% | Sri Lanka | suffix mapped; may still lack Yahoo coverage |
| OSL | 294 | 0.0% | Norway | suffix mapped; may still lack Yahoo coverage |
| HNX | 293 | 0.0% | Vietnam | suffix mapped; may still lack Yahoo coverage |
| BME | 282 | 0.0% | Spain | suffix mapped; may still lack Yahoo coverage |
| BST | 278 | 0.0% | Germany | suffix mapped; may still lack Yahoo coverage |
| PSE | 276 | 0.0% | Philippines | suffix mapped; may still lack Yahoo coverage |
| BVB | 272 | 0.0% | Romania | suffix mapped; may still lack Yahoo coverage |
| JSE | 260 | 0.0% | South Africa | suffix mapped; may still lack Yahoo coverage |
| BVL | 256 | 0.0% | Peru | no suffix map at scan time |
| SNSE | 253 | 0.0% | Chile | no suffix map at scan time |
| AMEX | 241 | 0.0% | United States | suffix mapped; may still lack Yahoo coverage |
| EGX | 224 | 0.0% | Egypt | suffix mapped; may still lack Yahoo coverage |
| HEL | 195 | 0.0% | Finland | suffix mapped; may still lack Yahoo coverage |
| MOEX | 182 | 0.0% | Russia | suffix mapped; may still lack Yahoo coverage |
| ASE | 161 | 0.0% | Jordan | no suffix map at scan time |
| MUN | 147 | 0.0% | Germany | suffix mapped; may still lack Yahoo coverage |
| ATH | 146 | 0.0% | Greece | suffix mapped; may still lack Yahoo coverage |
| CPH | 145 | 0.0% | Denmark | suffix mapped; may still lack Yahoo coverage |
| NGX | 142 | 0.0% | Nigeria | suffix mapped; may still lack Yahoo coverage |
| KWSE | 140 | 0.0% | Kuwait | no suffix map at scan time |
| BUL | 137 | 0.0% | Bulgaria | no suffix map at scan time |
| AMS | 118 | 0.0% | Netherlands | suffix mapped; may still lack Yahoo coverage |
| NZE | 117 | 0.0% | New Zealand | suffix mapped; may still lack Yahoo coverage |
| NGM | 110 | 0.0% | Sweden | no suffix map at scan time |
| JMSE | 108 | 0.0% | Jamaica | no suffix map at scan time |
| MSM | 107 | 0.0% | Oman | no suffix map at scan time |
| XKON | 106 | 0.0% | South Korea | no suffix map at scan time |
| ADX | 103 | 0.0% | United Arab Emirates | suffix mapped; may still lack Yahoo coverage |
| LUX | 98 | 0.0% | Luxembourg | no suffix map at scan time |
| HAM | 92 | 0.0% | Germany | suffix mapped; may still lack Yahoo coverage |
| BVC | 89 | 0.0% | Colombia | no suffix map at scan time |
| MUSE | 89 | 0.0% | Mauritius | no suffix map at scan time |
| NEO | 79 | 0.0% | Canada | suffix mapped; may still lack Yahoo coverage |
| CBSE | 77 | 0.0% | Morocco | no suffix map at scan time |
| BUD | 74 | 0.0% | Hungary | suffix mapped; may still lack Yahoo coverage |
| BVMT | 73 | 0.0% | Tunisia | no suffix map at scan time |
| NASE | 63 | 0.0% | Kenya | suffix mapped; may still lack Yahoo coverage |
| XNGO | 63 | 0.0% | Japan | no suffix map at scan time |
| DFM | 61 | 0.0% | United Arab Emirates | suffix mapped; may still lack Yahoo coverage |
| AQU | 60 | 0.0% | United Kingdom | no suffix map at scan time |
| PRA | 58 | 0.0% | Czech Republic | suffix mapped; may still lack Yahoo coverage |
| ZSE | 56 | 0.0% | Croatia | no suffix map at scan time |
| QSE | 55 | 0.0% | Qatar | suffix mapped; may still lack Yahoo coverage |
| XSAT | 52 | 0.0% | Sweden | no suffix map at scan time |
| ELI | 48 | 0.0% | Portugal | no suffix map at scan time |
| BRVM | 47 | 0.0% | West Africa | no suffix map at scan time |
| CYS | 46 | 0.0% | Cyprus | no suffix map at scan time |
| DUSE | 40 | 0.0% | Germany | suffix mapped; may still lack Yahoo coverage |
| PEX | 39 | 0.0% | Palestine | no suffix map at scan time |
| NMSE | 36 | 0.0% | Namibia | no suffix map at scan time |
| BAX | 35 | 0.0% | Bahrain | no suffix map at scan time |
| GHSE | 35 | 0.0% | Ghana | no suffix map at scan time |
| ZMSE | 35 | 0.0% | Zimbabwe | no suffix map at scan time |
| TTSE | 33 | 0.0% | Trinidad and Tobago | no suffix map at scan time |
| ICE | 32 | 0.0% | Iceland | no suffix map at scan time |
| MSE | 31 | 0.0% | Malawi | no suffix map at scan time |
| CCSE | 30 | 0.0% | Venezuela | no suffix map at scan time |
| TAL | 30 | 0.0% | United States | no suffix map at scan time |
| FKSE | 29 | 0.0% | Fiji | no suffix map at scan time |
| BELEX | 27 | 0.0% | Serbia | no suffix map at scan time |
| VSE | 24 | 0.0% | United States | no suffix map at scan time |
| DAR | 23 | 0.0% | Tanzania | no suffix map at scan time |
| KASE | 23 | 0.0% | Kazakhstan | no suffix map at scan time |
| LUSE | 23 | 0.0% | Zambia | no suffix map at scan time |
| ISE | 21 | 0.0% | Ireland | suffix mapped; may still lack Yahoo coverage |
| BSM | 18 | 0.0% | Botswana | no suffix map at scan time |
| LJSE | 17 | 0.0% | Slovenia | no suffix map at scan time |
| UGSE | 17 | 0.0% | Uganda | no suffix map at scan time |
| MAL | 15 | 0.0% | Malta | no suffix map at scan time |
| SPSE | 15 | 0.0% | Japan | no suffix map at scan time |
| NSX | 12 | 0.0% | Australia | no suffix map at scan time |
| RSE | 12 | 0.0% | Rwanda | no suffix map at scan time |
| BSSE | 9 | 0.0% | Slovakia | no suffix map at scan time |
| BDB | 6 | 0.0% | Lebanon | no suffix map at scan time |
| UKR | 5 | 0.0% | Ukraine | no suffix map at scan time |

## Biggest absolute gaps (by estimated missing count)
1. **China Shenzhen (SHE)** — symbol zero-padding required (e.g. `000001.SZ`); partial coverage
2. **Malaysia (KLSE)** — `.KL` suffix; Yahoo coverage incomplete for smaller names
3. **India NSE** — many valid; some delisted/illiquid codes fail
4. **Hong Kong** — numeric codes often need 4-digit padding (`0700.HK`)
5. **Singapore secondary (SGXC)**, **Saudi (TADAWUL `.SR`)**, **Vietnam**, **Switzerland**, **Spain**, **Norway**, **Philippines**, **Romania**, **South Africa**, and most African/Caribbean micro-exchanges

## What we fixed in code after this analysis
- Expanded Yahoo suffix map (Saudi `.SR`, Singapore `SGXC→.SI`, Romania `.RO`, dual German venues, etc.)
- **China A-share** numeric symbols padded to 6 digits
- **Hong Kong** numeric symbols padded to 4 digits
- More candidate tickers tried on live lookup

## What cannot be completed on free data alone
- Full price + financial statements for all 15k+ thin/micro listings
- Reliable dividends / ratios for OTC and frontier markets
- Real-time quotes (Yahoo is delayed / incomplete)

## Recommended next steps
1. Cache successful Yahoo responses in SQLite to avoid repeat failures
2. Mark exchanges as `live_supported=true/false` in UI so users know before clicking
3. For priority markets (US, India, UK, Japan, HK, China), batch-validate top symbols overnight with backoff
4. If budget allows: add Polygon.io or Twelve Data as secondary source for US/EU
