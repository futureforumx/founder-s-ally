# PitchBook enrichment progress

Last updated: 2026-11-03

## Scope snapshot

Live Supabase inventory reviewed for this batch:

- 18,299 active `firm_records`; 184 active firm records currently have PitchBook profile URLs; 6 of those still lack a most recent investment date after this continuation (exact REST inventory reread after 20 guarded date updates).
- 55,808 active `firm_investors`; the table has no PitchBook profile URL column. After enriching Sandeep Johri, among active rows, 5,437 have no `bio`, 27,931 have no `linkedin_url`, and 34,092 have no `short_summary` (exact REST counts reread during the current batch).
- 245 non-deleted startup rows; after the latest tranche, 157 lack either PitchBook URL key, 156 have no long description, 151 have no founded year, 156 have no HQ city, and 160 have no headcount. Missing-field counts overlap and include low-quality/imported rows that need triage before enrichment.
- Of the 245 non-deleted startup rows, an earlier filter found 221 plausible company candidates with at least one core field missing, excluding obvious imported signup/navigation rows.
- 86 startup rows currently have `external_ids.pitchbook_url`; Craft.co and 9fin retain PitchBook URLs in `external_ids.pitchbook_profile_url` from earlier enrichment, for 88 rows with either profile URL key (live count after the latest company tranche).

## Top 200 VC firm CSV batch

The supplied CSV contains 200 firms: 26 profile preview URLs marked found and 174 blank/unverified. All 26 provided links were opened with Playwright and matched by name/domain or a confirmed former name; missing profile URLs and PitchBook count fields were filled, while existing non-null values were retained. Blumberg Capital's provided URL returned 404, so its current profile was found and used. Reconciliation against active `firm_records` finds exact-name rows for 173 of the 200 CSV firms; 160 of those CSV names have at least one exact-name row with a PitchBook URL, while 13 exact-name rows remain without a profile URL because the candidate is ambiguous or no organization preview surfaced. The 26 direct PitchBook URLs supplied in the CSV were cross-checked against the database; 24 had exact-name rows and the other two (New Enterprise Associates and Tiger Global) were already enriched under confirmed VEKTA names New Enterprise Associates (NEA) and Tiger Global Management. These counts use case-insensitive exact names and do not include alias-only matches; duplicate VEKTA rows are tracked separately. The list of firms with prior profile searches and their outcomes is in the table below. The latest firm continuation matched Norwest Venture Partners to the Norwest PitchBook preview through the legacy nvp.com domain, and added the profile URL plus PitchBook counts to its two near-duplicate VEKTA firm rows. Earlier continuation matched Flagship Pioneering, M13, Amplify Partners, Slow Ventures, and Uncork Capital. Exact-name duplicates and inconsistent website/location fields were not overwritten.

| CSV firm | Verified PitchBook profile | Status |
| --- | --- | --- |
| Andreessen Horowitz | [41716-90](https://pitchbook.com/profiles/investor/41716-90) | Enriched |
| General Catalyst | [10123-03](https://pitchbook.com/profiles/investor/10123-03) | Enriched |
| Sequoia Capital | [11295-73](https://pitchbook.com/profiles/investor/11295-73) | Enriched |
| Accel | [10139-41](https://pitchbook.com/profiles/investor/10139-41) | Enriched |
| Insight Partners | [10331-11](https://pitchbook.com/profiles/investor/10331-11) | Enriched |
| Index Ventures | [11216-98](https://pitchbook.com/profiles/investor/11216-98) | Enriched |
| Alumni Ventures | [60082-66](https://pitchbook.com/profiles/investor/60082-66) | Enriched |
| Kleiner Perkins | [11228-50](https://pitchbook.com/profiles/investor/11228-50) | Enriched |
| New Enterprise Associates | [11251-81](https://pitchbook.com/profiles/investor/11251-81) | Enriched; matched to New Enterprise Associates (NEA) by website |
| 500 Global | [51006-88](https://pitchbook.com/profiles/investor/51006-88) | Enriched |
| Lux Capital | [11229-04](https://pitchbook.com/profiles/investor/11229-04) | Enriched |
| Balderton Capital | [10364-77](https://pitchbook.com/profiles/investor/10364-77) | Enriched |
| Tiger Global | [42873-94](https://pitchbook.com/profiles/investor/42873-94) | Enriched; PitchBook profile is Tiger Global Management |
| Gaingels | [124929-82](https://pitchbook.com/profiles/investor/124929-82) | Enriched |
| SOSV | [51322-24](https://pitchbook.com/profiles/investor/51322-24) | Enriched |
| FJ Labs | [108358-57](https://pitchbook.com/profiles/investor/108358-57) | Enriched |
| FJ Labs | https://pitchbook.com/profiles/investor/108358-57 | Re-read full preview; filled missing HQ country (US) and most recent investment date (2026-10-16). Existing 7 investing professionals, portfolio (871), and exits (571) retained. |
| True Ventures | [11321-29](https://pitchbook.com/profiles/investor/11321-29) | Enriched |
| DCM Ventures | [11165-50](https://pitchbook.com/profiles/investor/11165-50) | Enriched |
| IDG Capital | [11215-54](https://pitchbook.com/profiles/investor/11215-54) | Enriched |
| ZhenFund | [55778-14](https://pitchbook.com/profiles/investor/55778-14) | Enriched |
| Matrix Partners China | [91701-10](https://pitchbook.com/profiles/investor/91701-10) | Enriched; PitchBook identifies this as MPC (Beijing) and lists Matrix Partners China as a former name |
| Shunwei Capital | [58222-18](https://pitchbook.com/profiles/investor/58222-18) | Enriched |
| Foundry Group | [42240-79](https://pitchbook.com/profiles/investor/42240-79) | Enriched |
| Tenaya Capital | [40764-07](https://pitchbook.com/profiles/investor/40764-07) | Enriched |
| Blumberg Capital | [11127-25](https://pitchbook.com/profiles/investor/11127-25) | Enriched; CSV URL 10535-18 returned 404, replaced with current matching profile |
| Acequia Capital | [55271-44](https://pitchbook.com/profiles/investor/55271-44) | Enriched |

| Additional CSV firms discovered from blank URLs | Verified PitchBook profile | Status |
| --- | --- | --- |
| Lightspeed Venture Partners | [11333-26](https://pitchbook.com/profiles/investor/11333-26) | Enriched |
| Khosla Ventures | [11227-60](https://pitchbook.com/profiles/investor/11227-60) | Enriched |
| Bessemer Venture Partners | [10134-73](https://pitchbook.com/profiles/investor/10134-73) | Enriched |
| Founders Fund | [11315-62](https://pitchbook.com/profiles/investor/11315-62) | Enriched |
| 8VC | [149720-23](https://pitchbook.com/profiles/investor/149720-23) | Enriched |
| B Capital Group | [155248-48](https://pitchbook.com/profiles/investor/155248-48) | Enriched |
| Menlo Ventures | [11242-54](https://pitchbook.com/profiles/investor/11242-54) | Enriched |
| Norwest Venture Partners | [11258-83](https://pitchbook.com/profiles/investor/11258-83) | Profile found; skipped because two existing VEKTA records have legacy nvp.com websites and the PitchBook preview lists norwest.com |
| Battery Ventures | [10052-20](https://pitchbook.com/profiles/investor/10052-20) | Enriched |
| Redpoint Ventures | [11281-06](https://pitchbook.com/profiles/investor/11281-06) | Enriched |
| Headline | [11124-64](https://pitchbook.com/profiles/investor/11124-64) | Enriched; existing description confirms the former e.ventures/BV Capital entity; existing website value was retained |
| F-Prime Capital | [124929-64](https://pitchbook.com/profiles/investor/124929-64) | Enriched exact-name row; a second F-Prime Capital Partners record with the same domain was left untouched |
| First Round Capital | [11189-44](https://pitchbook.com/profiles/investor/11189-44) | Enriched |
| Felicis Ventures | [42715-00](https://pitchbook.com/profiles/investor/42715-00) | Enriched; PitchBook profile title is Felicis |
| Peak XV Partners | [167489-20](https://pitchbook.com/profiles/investor/167489-20) | Profile verified; skipped because no exact-name or website-matched existing VEKTA firm record was found |
| Greylock Partners | [11191-96](https://pitchbook.com/profiles/investor/11191-96) | Profile verified; skipped because two same-name VEKTA records had no website to distinguish the target |
| Draper Associates | [56010-97](https://pitchbook.com/profiles/investor/56010-97) | Enriched; matched by exact firm name and draper.vc domain |
| Ribbit Capital | [55346-14](https://pitchbook.com/profiles/investor/55346-14) | Enriched; matched by exact firm name and ribbitcap.com domain |
| QED Investors | [50943-70](https://pitchbook.com/profiles/investor/50943-70) | Enriched; matched by exact firm name and qedinvestors.com domain |
| OrbiMed | [11263-51](https://pitchbook.com/profiles/investor/11263-51) | Enriched exact-name row; orbimed.com matched, separate OrbiMed Advisors record retained untouched |
| Spark Capital | [11303-02](https://pitchbook.com/profiles/investor/11303-02) | Enriched; matched by exact firm name and sparkcapital.com domain |
| Bain Capital Ventures | [42202-18](https://pitchbook.com/profiles/investor/42202-18) | Enriched; matched by exact firm name and baincapitalventures.com domain |
| FirstMark Capital | [11270-53](https://pitchbook.com/profiles/investor/11270-53) | Enriched; matched by exact firm name and firstmark.com domain |
| Nexus Venture Partners | [11254-42](https://pitchbook.com/profiles/investor/11254-42) | Enriched; matched by exact firm name and nexusvp.com domain |
| 468 Capital | [434673-19](https://pitchbook.com/profiles/investor/434673-19) | Enriched; matched by exact firm name and 468cap.com domain |
| Partech | [11268-55](https://pitchbook.com/profiles/investor/11268-55) | Enriched on the exact Partech Partners row with matching partechpartners.com domain |
| TCV | [10271-98](https://pitchbook.com/profiles/investor/10271-98) | Enriched exact-name row; a second TCV (Technology Crossover) record was left untouched |
| Base10 Partners | [167562-37](https://pitchbook.com/profiles/investor/167562-37) | Enriched; matched by exact firm name and base10.vc domain |
| 3one4 Capital | [154351-72](https://pitchbook.com/profiles/investor/154351-72) | Enriched; matched by exact firm name and 3one4capital.com domain |
| ARCH Venture Partners | [11111-68](https://pitchbook.com/profiles/investor/11111-68) | Enriched; matched by exact firm name and archventure.com domain |
| SBI Investment | [95034-70](https://pitchbook.com/profiles/investor/95034-70) | Enriched; matched by exact firm name and sbinvestment.co.jp domain |
| Sapphire Ventures | [11293-66](https://pitchbook.com/profiles/investor/11293-66) | Enriched; matched by exact firm name and sapphireventures.com domain |
| Altimeter Capital | [42770-53](https://pitchbook.com/profiles/investor/42770-53) | Enriched on the Altimeter row by exact altimeter.com website match; duplicate with unrelated website retained untouched |
| Goodwater Capital | [64182-25](https://pitchbook.com/profiles/investor/64182-25) | Enriched; matched by exact firm name and goodwatercap.com domain |
| Kima Ventures | [51022-00](https://pitchbook.com/profiles/investor/51022-00) | Enriched; matched by exact firm name and kimaventures.com domain |
| Eclipse | [126290-08](https://pitchbook.com/profiles/investor/126290-08) | Enriched on eclipse.capital match; PitchBook says formerly Eclipse Ventures; duplicate row left untouched |
| Left Lane Capital | [432890-65](https://pitchbook.com/profiles/investor/432890-65) | Enriched; matched by exact firm name and leftlane.com domain |
| Paradigm | [233744-05](https://pitchbook.com/profiles/investor/233744-05) | Enriched; matched by exact firm name and paradigm.xyz domain |
| Seedcamp | [51064-84](https://pitchbook.com/profiles/investor/51064-84) | Enriched; matched by exact firm name and seedcamp.com domain |
| Canaan Partners | [11135-71](https://pitchbook.com/profiles/investor/11135-71) | Enriched; matched by exact firm name and canaan.com domain |
| Atomico | [40732-48](https://pitchbook.com/profiles/investor/40732-48) | Enriched on atomico.com match; PitchBook title is Atomico (UK) Partners |
| Vertex Ventures | [114710-05](https://pitchbook.com/profiles/investor/114710-05) | Matched to the existing Vertex Ventures US record by exact firm name; other geographic Vertex firms remain separate |
| Benchmark | [11133-01](https://pitchbook.com/profiles/investor/11133-01) | Enriched exact-name row by benchmark.com domain match; duplicate row left untouched |
| CRV (Charles River) | [10133-20](https://pitchbook.com/profiles/investor/10133-20) | Enriched the exact CRV row by crv.com domain match; expanded-name duplicate left untouched |
| EQT Ventures | [155247-58](https://pitchbook.com/profiles/investor/155247-58) | Enriched; matched by exact firm name and eqtventures.com domain |
| BoxGroup | [56833-03](https://pitchbook.com/profiles/investor/56833-03) | Enriched; matched by exact firm name and boxgroup.com domain |
| CDP Venture Capital SGR | [123355-81](https://pitchbook.com/profiles/investor/123355-81) | Enriched unique CDP Venture Capital record by exact firm name; PitchBook title is CDP Venture Capital (Rome) |
| Thrive Capital | [51625-90](https://pitchbook.com/profiles/investor/51625-90) | Enriched; unique exact-name record |
| Notion Capital | [51311-35](https://pitchbook.com/profiles/investor/51311-35) | Enriched; exact name; website notion.vc matches current firm while PitchBook lists notioncapital.com |
| SignalFire | [60622-12](https://pitchbook.com/profiles/investor/60622-12) | Enriched unique exact-name row; existing website field is a challenge placeholder and was retained |
| Cherry Ventures | [100624-51](https://pitchbook.com/profiles/investor/100624-51) | Enriched; matched by exact firm name and cherry.vc domain |
| Sofinnova Partners | [11300-05](https://pitchbook.com/profiles/investor/11300-05) | Enriched; matched by exact firm name and sofinnovapartners.com domain |
| Susa Ventures | [60139-90](https://pitchbook.com/profiles/investor/60139-90) | Enriched unique exact-name record; PitchBook facts added only where fields were missing |
| Union Square Ventures | [11323-45](https://pitchbook.com/profiles/investor/11323-45) | Enriched exact-name row by usv.com domain match; opportunity and climate fund records left untouched |
| Global Brain | [52202-35](https://pitchbook.com/profiles/investor/52202-35) | Enriched exact-name row by globalbrains.com domain match; corporate-name duplicate left untouched |
| LocalGlobe | [148770-82](https://pitchbook.com/profiles/investor/148770-82) | Enriched; PitchBook confirms Phoenix Court was formerly known as LocalGlobe |
| Soma Capital | [110937-70](https://pitchbook.com/profiles/investor/110937-70) | Enriched unique exact-name record; PitchBook facts added to missing fields |
| Threshold Ventures | [267929-02](https://pitchbook.com/profiles/investor/267929-02) | Enriched unique exact-name record; PitchBook lists DFJ Venture as a former name |
| WndrCo | [170084-35](https://pitchbook.com/profiles/investor/170084-35) | Enriched exact-name row; separate WndrCo LLC duplicate left untouched |
| SV Angel | [50980-60](https://pitchbook.com/profiles/investor/50980-60) | Enriched unique exact-name record; PitchBook values filled only where fields were missing |
| Liquid 2 Ventures | [149517-28](https://pitchbook.com/profiles/investor/149517-28) | Enriched; matched by exact firm name and liquid2.vc domain |
| Pioneer Fund | [226139-77](https://pitchbook.com/profiles/investor/226139-77) | Enriched unique exact-name record; existing challenge-placeholder website retained |
| 20VC | [108618-40](https://pitchbook.com/profiles/investor/108618-40) | Enriched; matched by exact firm name and 20vc.fund domain |
| Abstract Ventures | [179440-93](https://pitchbook.com/profiles/investor/179440-93) | Enriched; matched by exact firm name |
| Gradient Ventures | [183174-31](https://pitchbook.com/profiles/investor/183174-31) | Enriched; matched by exact firm name and gradient.com domain |
| Inflection Point Ventures | [294498-37](https://pitchbook.com/profiles/investor/294498-37) | Enriched on ipventures.in match; PitchBook title is Inflection Point Ventures (India) |
| Madrona Venture | [11229-85](https://pitchbook.com/profiles/investor/11229-85) | Enriched on the Madrona Venture Group record by exact madrona.com domain match |
| Pantera Capital | [60945-31](https://pitchbook.com/profiles/investor/60945-31) | Enriched; matched by exact firm name and panteracapital.com domain |
| Oak HC/FT | [87063-49](https://pitchbook.com/profiles/investor/87063-49) | Enriched unique exact-name record; filled missing URL, counts, and basics |
| Standard Capital | [864853-66](https://pitchbook.com/profiles/investor/864853-66) | Enriched; exact firm name and standardcap.com domain; PitchBook preview does not expose exits, left blank |
| Earlybird Venture Capital | [11159-74](https://pitchbook.com/profiles/investor/11159-74) | Enriched; matched by exact firm name and earlybird.com domain |
| Kindred Ventures | [223507-63](https://pitchbook.com/profiles/investor/223507-63) | Enriched; matched by exact firm name and kindredventures.com domain |
| Vertex Ventures Southeast Asia & India | [149516-20](https://pitchbook.com/profiles/investor/149516-20) | Enriched; matched by exact firm name and vertexventures.sg domain |
| Flare Capital Partners | [126812-62](https://pitchbook.com/profiles/investor/126812-62) | Enriched unique exact-name record; filled missing link, counts, and basics |
| S3 Ventures | [42943-96](https://pitchbook.com/profiles/investor/42943-96) | Enriched; matched by exact firm name and s3vc.com domain |
| AlleyCorp | [108968-59](https://pitchbook.com/profiles/investor/108968-59) | Enriched; matched by exact firm name and alleycorp.com domain |
| Crosslink Capital | [11261-89](https://pitchbook.com/profiles/investor/11261-89) | Enriched; matched by exact firm name and crosslinkcapital.com domain |
| Kaszek Ventures | [52902-10](https://pitchbook.com/profiles/investor/52902-10) | Enriched; exact kaszek.com match; added team, portfolio and exit counts and country |
| Genesia Ventures | [227478-07](https://pitchbook.com/profiles/investor/227478-07) | Enriched on en.genesiaventures.com match; added team, portfolio, exit counts, founding year, and HQ |
| Kae Capital | [54192-61](https://pitchbook.com/profiles/investor/54192-61) | Enriched on kae-capital.com match; added team, portfolio, exit counts, and founding year |
| Maverick Ventures | [181009-27](https://pitchbook.com/profiles/investor/181009-27) | Enriched unique exact-name row matching PitchBook San Francisco description; filled missing link, counts, founding year, country |
| Northzone | [11258-56](https://pitchbook.com/profiles/investor/11258-56) | Enriched exact-name and northzone.com match; filled missing link and counts |
| RTP Global | [52304-50](https://pitchbook.com/profiles/investor/52304-50) | Enriched exact-name and rtp.vc match; filled missing link and counts |
| MaC Venture Capital | [267599-80](https://pitchbook.com/profiles/investor/267599-80) | Enriched exact-name and macventurecapital.com match; filled missing link and counts |
| Blume Ventures | [54197-38](https://pitchbook.com/profiles/investor/54197-38) | Enriched by exact blume.vc website match; PitchBook profile title is Blume Venture Advisors |
| Basis Set Ventures | [182527-66](https://pitchbook.com/profiles/investor/182527-66) | Enriched by exact name and basisset.com match |
| Mantis VC | [431348-32](https://pitchbook.com/profiles/investor/431348-32) | Enriched exact-name match; conflicting existing HQ was retained |
| Pear VC | [58373-20](https://pitchbook.com/profiles/investor/58373-20) | Enriched by pear.vc and confirmed former name Pejman Mar Ventures |
| Alstin Capital | [54594-91](https://pitchbook.com/profiles/investor/54594-91) | Enriched exact-name and Munich match; conflicting founding year and location fields were retained |
| High-Tech Gründerfonds | [53975-26](https://pitchbook.com/profiles/investor/53975-26) | Enriched by exact name and htgf.de match; existing Berlin HQ was retained against PitchBook's Bonn HQ |
| Conviction | [510108-40](https://pitchbook.com/profiles/investor/510108-40) | Enriched Conviction Partners record via exact conviction.com domain and San Francisco address |
| Craft Ventures | [225318-25](https://pitchbook.com/profiles/investor/225318-25) | Enriched by exact name and craftventures.com match |
| Eniac Ventures | [51472-63](https://pitchbook.com/profiles/investor/51472-63) | Enriched by exact name and eniac.vc; added link and counts; existing founded year and Toronto location retained against PitchBook |
| Precursor Ventures | [125084-71](https://pitchbook.com/profiles/investor/125084-71) | Enriched by exact name and precursorvc.com; added link and counts |
| Mayfield Fund | [11237-95](https://pitchbook.com/profiles/investor/11237-95) | Enriched exact-name and mayfield.com match; added link and counts |
| TQ Ventures | [232265-71](https://pitchbook.com/profiles/investor/232265-71) | Enriched exact-name match; added website/domain, link, and counts |
| Pi Labs | [97882-39](https://pitchbook.com/profiles/investor/97882-39) | Enriched exact-name and pilabs.vc match; added link and counts; existing founding year retained against PitchBook |
| Ten Eleven Ventures | [97587-10](https://pitchbook.com/profiles/investor/97587-10) | Enriched exact-name match; added link and counts; conflicting existing website/domain and location values retained |
| Airtree Ventures | [100778-23](https://pitchbook.com/profiles/investor/100778-23) | Enriched exact-name and airtree.vc match; added link and counts |
| Caffeinated Capital | [57379-15](https://pitchbook.com/profiles/investor/57379-15) | Enriched exact-name match; added link and counts; existing domain and location fields retained despite conflicts |
| Radical Ventures | [267279-76](https://pitchbook.com/profiles/investor/267279-76) | Enriched exact-name, Toronto, and 2017 match; added link and counts; other existing website/location fields retained |
| Initialized Capital | [54726-76](https://pitchbook.com/profiles/investor/54726-76) | Enriched exact-name and initialized.com match; added link and counts; conflicting existing founding year and HQ retained |
| Greenoaks Capital | [54855-55](https://pitchbook.com/profiles/investor/54855-55) | Enriched exact domain and former-name match; added link and counts |
| Lowercarbon Capital | [277115-14](https://pitchbook.com/profiles/investor/277115-14) | Enriched exact name and lowercarbon.com match; added link and counts; conflicting existing location retained |
| Greycroft | [11191-87](https://pitchbook.com/profiles/investor/11191-87) | Enriched exact name and domain; added link and counts; malformed non-null country field retained |
| Forerunner Ventures | [52507-90](https://pitchbook.com/profiles/investor/52507-90) | Enriched exact name and forerunnerventures.com match; added link and counts; existing founding year retained |
| Flybridge Capital | [11215-63](https://pitchbook.com/profiles/investor/11215-63) | Enriched `Flybridge` by exact flybridge.com domain and founded year; added profile URL, 11 professionals, 370 portfolio companies, and 198 exits; retained existing Boston location |
| IVP | [11211-40](https://pitchbook.com/profiles/investor/11211-40) | Enriched exact-name `IVP` row by ivp.com, Menlo Park, and 1980; added profile URL, 26 professionals, 92 portfolio companies, and 310 exits; left duplicate conflicting record untouched |
| Georgian | [40431-25](https://pitchbook.com/profiles/investor/40431-25) | Existing populated VEKTA record verified; no changes needed |
| Elevation Capital | — | Skipped: search returned multiple distinct PitchBook firms and no unambiguous matching VEKTA record |
| South Park Commons | [230619-43](https://pitchbook.com/profiles/investor/230619-43) | Profile found, but the only VEKTA row has a different domain, New York HQ, and 2013 founding year; PitchBook lists southparkcommons.co, San Francisco, and 2016, so no write was made |
| Team8 | [108037-45](https://pitchbook.com/profiles/investor/108037-45) | Enriched exact-name and team8.vc match; added profile URL, 32 professionals, 51 portfolio companies, and 16 exits; existing founding year retained |
| BEENEXT | [153309-25](https://pitchbook.com/profiles/investor/153309-25) | Enriched `Beenext` by exact beenext.com domain and 2015 founding year; added profile URL, 15 professionals, 224 portfolio companies, and 81 exits; existing HQ city retained |
| Unusual Ventures | [227419-12](https://pitchbook.com/profiles/investor/227419-12) | Enriched exact name and unusual.vc; added profile URL, 5 professionals, 95 portfolio companies, and 58 exits |
| Collaborative Fund | [51595-21](https://pitchbook.com/profiles/investor/51595-21) | Enriched exact name and collabfund.com; added profile URL, 9 professionals, 400 portfolio companies, and 219 exits |
| Atinum Investment | [10594-72](https://pitchbook.com/profiles/investor/10594-72) | Enriched exact name and atinuminvest.co.kr; added profile URL, 33 professionals, 165 portfolio companies, and 139 exits |
| Emergence Capital | [11171-44](https://pitchbook.com/profiles/investor/11171-44) | Enriched the exact emcap.com/2003/San Francisco match to Emergence Equity Management; added profile URL, 13 professionals, 80 portfolio companies, and 102 exits |
| Blackbird Ventures | [56336-41](https://pitchbook.com/profiles/investor/56336-41) | Enriched the exact-name row by matching blackbird.vc, founded 2012, Surry Hills; added profile URL, 17 professionals, 157 portfolio companies, and 89 exits; duplicate Blackbird Ventures Australia row left unchanged |
| HV Capital | [51189-94](https://pitchbook.com/profiles/investor/51189-94) | Enriched exact hvcapital.com and founded-2000 match; added profile URL, 35 professionals, 121 portfolio companies, and 202 exits; retained existing Berlin HQ value |
| Costanoa Ventures | [54613-90](https://pitchbook.com/profiles/investor/54613-90) | Enriched exact costanoa.vc, Palo Alto, and 2012 match; added profile URL, 11 professionals, 93 portfolio companies, and 58 exits |
| Foundation Capital | [11193-13](https://pitchbook.com/profiles/investor/11193-13) | Enriched exact foundationcapital.com and founded-1995 match; added profile URL, 16 professionals, 202 portfolio companies, and 398 exits; retained existing Menlo Park HQ value |
| Summit Partners | [10121-86](https://pitchbook.com/profiles/investor/10121-86) | Enriched exact summitpartners.com, Boston, and founded-1984 match; added profile URL, 143 professionals, 123 portfolio companies, and 488 exits |
| Meritech Capital Partners | [11240-47](https://pitchbook.com/profiles/investor/11240-47) | Enriched exact meritechcapital.com, Palo Alto, and founded-1999 match; added profile URL, 12 professionals, 70 portfolio companies, and 194 exits |
| FPV Ventures | [499888-72](https://pitchbook.com/profiles/investor/499888-72) | Enriched the `FPV Fund` row by exact fpvventures.com domain and 2022 founding year; added profile URL, 2 professionals, 42 portfolio companies, and 4 exits; retained existing San Francisco HQ despite PitchBook Jackson HQ |
| AlbionVC | [233965-45](https://pitchbook.com/profiles/investor/233965-45) | Enriched exact albion.vc match; added profile URL, 19 professionals, 79 portfolio companies, 66 exits, 1996 founding year, and London HQ |
| Z Venture Capital | [463972-69](https://pitchbook.com/profiles/investor/463972-69) | Enriched exact zvc.vc match; added profile URL, 16 professionals, 188 portfolio companies, and 92 exits; retained conflicting existing HQ and founding year |
| Better Tomorrow Ventures | [343469-35](https://pitchbook.com/profiles/investor/343469-35) | Enriched exact btv.vc and 2019 founding-year match; added profile URL, 4 professionals, 89 portfolio companies, and 26 exits; retained conflicting existing location fields |
| Point72 Ventures | [170055-28](https://pitchbook.com/profiles/investor/170055-28) | Enriched exact-name and 2016 founding-year match; added profile URL, 9 professionals, 117 portfolio companies, and 79 exits; retained existing location fields |
| Reach Capital | [111506-59](https://pitchbook.com/profiles/investor/111506-59) | Enriched exact reachcapital.com, 2015, and San Francisco match; added profile URL, 11 professionals, 119 portfolio companies, and 69 exits; filled missing state and country |
| Titan Capital | [66331-09](https://pitchbook.com/profiles/investor/66331-09) | Enriched exact titancapital.vc and Gurugram match; added profile URL, 13 professionals, 240 portfolio companies, and 68 exits; retained conflicting existing founded year and country |
| Bloomberg Beta | [83135-44](https://pitchbook.com/profiles/investor/83135-44) | Enriched exact name, bloombergbeta.com, San Francisco, and 2013 match; added profile URL, 5 professionals, 158 portfolio companies, and 149 exits |
| Crane Venture Partners | [187432-21](https://pitchbook.com/profiles/investor/187432-21) | Enriched exact name, crane.vc, and 2015 match; added profile URL, 11 professionals, 100 portfolio companies, and 30 exits |
| Cyberstarts | [43076-53](https://pitchbook.com/profiles/investor/43076-53) | Enriched exact cyberstarts.com, name, and 2018 match; added profile URL, 5 professionals, 18 portfolio companies, and 11 exits; existing location retained |
| Inovia Capital | [10618-12](https://pitchbook.com/profiles/investor/10618-12) | Enriched exact name/domain and 2007 match; added profile URL, 39 professionals, 137 portfolio companies, and 141 exits; existing location fields retained |
| Inspired Capital | [266110-03](https://pitchbook.com/profiles/investor/266110-03) | Enriched exact inspiredcapital.com, name, and 2019 match; added profile URL, 7 professionals, 77 portfolio companies, and 17 exits |
| LG Technology Ventures | [234526-87](https://pitchbook.com/profiles/investor/234526-87) | Enriched exact lgtechventures.com and Santa Clara match; added profile URL, 8 professionals, 95 portfolio companies, 20 exits, and missing country; retained conflicting existing founding year |
| XYZ Venture Capital | [178234-03](https://pitchbook.com/profiles/investor/178234-03) | Enriched exact xyz.vc and firm name; added profile URL, 8 professionals, 108 portfolio companies, and 30 exits; retained conflicting existing year and location values |
| Kaszek | [52902-10](https://pitchbook.com/profiles/investor/52902-10) | Listed as Kaszek Ventures in VEKTA; exact kaszek.com profile was enriched earlier |
| Lakestar | [58578-13](https://pitchbook.com/profiles/investor/58578-13) | Profile found, but three VEKTA candidates (Lakestar, Lakestar Advisors, and Lakestar Ventures) prevent an unambiguous match; no write made |
| Gorilla Capital | [85287-70](https://pitchbook.com/profiles/investor/85287-70) | Enriched exact gorillacapital.fi and Finland match; added profile URL, 4 professionals, 89 portfolio companies, 61 exits, 2012 founding year, and Helsinki HQ |
| Illuminate Financial | [107958-25](https://pitchbook.com/profiles/investor/107958-25) | Enriched exact illuminatefinancial.com and 2014 match; added profile URL, 11 professionals, 43 portfolio companies, and 17 exits; retained existing address/location fields |
| 5AM Ventures | [11104-03](https://pitchbook.com/profiles/investor/11104-03) | Enriched exact 5amventures.com and 2002 match; added profile URL, 14 professionals, 35 portfolio companies, and 112 exits; retained existing location fields |
| Upfront Ventures | [11201-59](https://pitchbook.com/profiles/investor/11201-59) | Enriched exact upfront.com and 1996 match; added profile URL, 15 professionals, 104 portfolio companies, and 194 exits; retained existing location fields |
| Venrock | [11326-33](https://pitchbook.com/profiles/investor/11326-33) | Enriched exact name/domain and 1969 match; added profile URL, 31 professionals, 117 portfolio companies, and 536 exits |
| SR One by GSK | [11304-55](https://pitchbook.com/profiles/investor/11304-55) | Enriched matching srone.com record; added profile URL, 9 professionals, 31 portfolio companies, 162 exits, 1985 founding year, and Redwood City HQ |
| Fifth Wall | [167492-08](https://pitchbook.com/profiles/investor/167492-08) | Enriched exact website/name match; added profile URL, 28 professionals, 103 portfolio companies, and 71 exits; retained existing year and New York HQ |
| NFX | [124319-53](https://pitchbook.com/profiles/investor/124319-53) | Enriched exact name/domain match; added profile URL, 13 professionals, 259 portfolio companies, and 217 exits; retained existing year/location |
| Homebrew | [56078-47](https://pitchbook.com/profiles/investor/56078-47) | Enriched exact homebrew.co match; added profile URL, 2 professionals, 108 portfolio companies, and 106 exits; kept duplicate row untouched |
| Lerer Hippeau | [50980-69](https://pitchbook.com/profiles/investor/50980-69) | Enriched exact name/domain and 2010 match; added profile URL, 8 professionals, 152 portfolio companies, and 348 exits |
| Slow Ventures | [54207-19](https://pitchbook.com/profiles/investor/54207-19) | Enriched exact slow.co match; added profile URL, 5 professionals, 205 portfolio companies, and 344 exits; existing year and Boston HQ retained due conflicts |
| Uncork Capital | [48176-38](https://pitchbook.com/profiles/investor/48176-38) | Enriched exact name, uncorkcapital.com, 2004, and San Francisco match; added profile URL, 6 professionals, 97 portfolio companies, and 192 exits |
| Flagship Pioneering | [11262-52](https://pitchbook.com/profiles/investor/11262-52) | Enriched exact name, domain, founded year, and Cambridge match; added profile URL, 108 professionals, 38 portfolio companies, and 156 exits |
| M13 | [160610-32](https://pitchbook.com/profiles/investor/160610-32) | Enriched exact name/domain match; added profile URL, 22 professionals, 129 portfolio companies, and 134 exits; conflicting existing HQ and founding year retained |
| Amplify Partners | [55612-00](https://pitchbook.com/profiles/investor/55612-00) | Enriched exact amplifypartners.com match; added profile URL, 11 professionals, 112 portfolio companies, and 86 exits; existing founding year and Los Angeles HQ retained despite preview conflicts |
| Plural | — | Search found two distinct PitchBook profiles (Plural VC in Washington, DC and Plural Platform in London); no matching VEKTA firm record found |
| K-Fund | — | PitchBook site search returned no profile preview; no matching VEKTA firm record found |
| KB Investment | [50907-70](https://pitchbook.com/profiles/investor/50907-70) | PitchBook profile found, but no matching VEKTA firm record found |
| Washington Harbour Partners | — | PitchBook site search returned no profile preview |
| Engine Ventures | [167652-55](https://pitchbook.com/profiles/investor/167652-55) | Profile found, but the VEKTA `Reengine Ventures` row is not the same firm |
| Maverick Silicon | [711362-17](https://pitchbook.com/profiles/investor/711362-17) | PitchBook profile found; no matching VEKTA firm record found |
| Rainmatter | [231060-97](https://pitchbook.com/profiles/investor/231060-97) | Rainmatter Capital profile found; no matching VEKTA firm record found |
| Square Peg Capital | [56617-66](https://pitchbook.com/profiles/investor/56617-66) | Profile found, but two VEKTA rows have conflicting domains and locations; no write made |
| Qiming VP | — | Search surfaced individual profiles associated with Qiming but no direct firm preview; two VEKTA records share qimingvc.com and have conflicting geography, so no write made |
| Flex Capital | [460275-94](https://pitchbook.com/profiles/investor/460275-94) | Search found a San Francisco firm, but the VEKTA Flex Capital row is a Berlin firm with different founding year; no write made |
| Entrepreneur First | — | DuckDuckGo PitchBook site search returned no profile preview; no write made |

The enum for startup `data_sources` has no PitchBook value. Enriched rows keep their existing primary source, add `OTHER` to `data_sources`, and store the exact PitchBook profile URL and profile ID in `external_ids`.

## Full profile previews read and saved

| Record | PitchBook profile | Status |
| --- | --- | --- |
| Entrepreneur First | https://pitchbook.com/profiles/investor/64215-37 | Completed full preview; exact joinef.com and name match; added profile URL, founded 2011, 44 professionals, 521 portfolio companies, and 355 exits. Existing location retained due conflict. |
| Genius AI | https://pitchbook.com/profiles/company/150445-09 | Completed full preview; exact genius.ai match; added profile URL, founded 2015, 413 employees, New York HQ, description, AI sector, verticals, and latest secondary deal date/type. Existing $44M raised retained against PitchBook's $116M; existing source retained, with profile URL stored in `external_ids`. |
| Altimeter | https://pitchbook.com/profiles/investor/42770-53 | Re-read full preview; exact altimeter.com match; filled founded 2008, Menlo Park/California/US HQ, and description. Existing 9 investing professionals and 64 portfolio/45 exits retained. Total employee count remains blank because PitchBook reports investing professionals, not total headcount. |
| WndrCo | https://pitchbook.com/profiles/investor/170084-35 | Re-read full preview; exact-name match; filled founded 2016, Redwood City/California/US HQ, and description. Existing 10 investing professionals and 195 portfolio/99 exits retained. Total employee count remains blank because PitchBook reports investing professionals, not total headcount. |
| Sandeep Johri | https://pitchbook.com/profiles/investor/327281-14 | Exact-name individual record and angel-investor profile match; filled bio, short summary, background summary, and total known investments (5). PitchBook page link is recorded here because `firm_investors` has no profile URL column; no personal location inferred. |
| Granola Inc. | https://pitchbook.com/profiles/company/527331-97 | Exact granola.ai match; added PitchBook URL, description, founded 2023, 55 employees, Dover/Delaware/US HQ, AI sector/verticals, and Series C ($125M, 2026-03-25). Existing $125M total raised retained against PitchBook FAQ $192M; existing Series A stage retained. |
| EPIC Microsystems | https://pitchbook.com/profiles/company/700676-47 | Exact epicmicro.com match; added profile URL, description, founded 2024, San Jose/California/US HQ, AI sector/vertical, and Series A ($21M, 2026-03-25). Existing $21M total raised retained against PitchBook FAQ $26M; existing Series A stage retained. Headcount was not shown in the preview and remains blank. |
| Payward, Inc. (Kraken) | https://pitchbook.com/profiles/company/60921-19 | Exact kraken.com domain and matching crypto-exchange description; added profile URL, description, founded 2011, 3,000 employees, Cheyenne/Wyoming/US HQ, FINTECH sector, and verticals. Existing $200M total raised retained against PitchBook FAQ $1.01B; existing GROWTH stage retained. Latest deal fields left blank due conflicting summary/table timing in the preview. |

| Record | PitchBook profile | Status |
| --- | --- | --- |
| Portage Ventures | https://pitchbook.com/profiles/investor/167212-00 | Completed preview; added profile URL, 35 professionals, 135 portfolio companies, and 39 exits. Existing location retained due conflict. |
| Craft.co | https://pitchbook.com/profiles/company/121885-75#overview | Re-read full preview; exact craft.co match; filled missing headcount (102). |
| Gimlet Labs, Inc. | https://pitchbook.com/profiles/company/607941-46 | Completed; filled description, founded 2023, 30 employees, San Francisco HQ, industry verticals, and Series B ($300M, 2026-09-04). Existing $80M total raised and Series A stage were retained despite PitchBook conflicts. |
| Develop Health | https://pitchbook.com/profiles/company/509692-96 | Completed; filled description, founded 2022, 9 employees, Menlo Park HQ, total raised and Series A ($17.6M, 2025-09-30), and industry verticals. Existing `stage=BOOTSTRAPPED` was retained despite PitchBook showing venture backing. |
| AfterQuery | https://pitchbook.com/profiles/company/770029-39 | Completed; matched afterquery.com. Filled description, 2024 founding year, 102 employees, San Francisco HQ, industry verticals, and profile provenance. Existing $30M raised and Series A were retained; the listed Series B was rumor/speculation. |
| 9fin | https://pitchbook.com/profiles/company/179022-16 | Re-read full preview; exact 9fin.com match; filled missing long description. Existing headcount 444 retained. |
| ABConvert | https://pitchbook.com/profiles/company/601901-47 | Completed; description, founding year, employees, HQ, industry, latest deal date/type |
| ActionAI | https://pitchbook.com/profiles/company/739621-45 | Re-read full preview; exact actionai.co match; existing description, founded year, HQ, website/domain, and industry verified. PitchBook preview has no employee figure, so missing headcount remains blank. |
| AegisAI | https://pitchbook.com/profiles/company/975620-89 | Completed; description, founding year, employees, HQ, latest round |
| Doppel | https://pitchbook.com/profiles/company/497349-28 | Completed; description, founding year, employees, HQ, latest deal date/type |
| Omnea | https://pitchbook.com/profiles/company/498502-54 | Completed; description, founding year, employees, HQ, latest deal date/type |
| Listen Labs | https://pitchbook.com/profiles/company/590724-19 | Completed; description, founding year, employees, HQ, latest deal date/type |
| Harvey | https://pitchbook.com/profiles/company/510703-21 | Completed; description, founding year, employees, HQ, latest Series H deal |
| Traba | https://pitchbook.com/profiles/company/470636-11 | Completed; description, founding year, employees, HQ, latest Series B deal |
| Vanta | https://pitchbook.com/profiles/company/231357-97 | Completed; description, founding year, employees, HQ, total raised, latest deal date/type |
| OpenRouter | https://pitchbook.com/profiles/company/593134-93 | Completed; description, founding year, employees, HQ, total raised, industry |
| Tennr | https://pitchbook.com/profiles/company/509386-15 | Completed; description, founding year, employees, HQ, total raised, latest Series C deal |
| Ambience Healthcare | https://pitchbook.com/profiles/company/442685-89 | Completed; description, founding year, employees, HQ, total raised, latest Series C deal |
| Vapi | https://pitchbook.com/profiles/company/463291-48 | Completed; description, founding year, employees, HQ, total raised, latest Series B deal |
| IcePanel | https://pitchbook.com/profiles/company/515846-71 | Completed; description, founding year, employees, HQ, total raised, latest accelerator deal |
| WeSki | https://pitchbook.com/profiles/company/169355-44 | Completed; description, founding year, employees, HQ, total raised, latest deal |
| Aragon.ai | https://pitchbook.com/profiles/company/519012-46 | Completed; description, founding year, employees, HQ, total raised, latest accelerator deal |
| Midjourney | https://pitchbook.com/profiles/company/509453-02 | Completed; description, founding year, employees, HQ, industry |
| Stakin | https://pitchbook.com/profiles/company/519002-02 | Completed full preview; filled year founded, employees, HQ, sector and industry verticals. PitchBook shows acquisition by The Tie on 2025-12-08; existing `status=ACTIVE` was not overwritten because this batch fills missing values only. |
| Serval | https://pitchbook.com/profiles/company/596220-13 | Completed full preview; filled year founded, employees, HQ, sector/industry verticals and latest Series C amount/date/type ($150M, 2026-10-29). Total raised was not stated in the preview and remains blank. |
| Mercor | https://pitchbook.com/profiles/company/534425-05 | Completed full preview; exact name and matching AI hiring description; filled year founded, employees, HQ, industry verticals and PitchBook FAQ total raised ($519M). Latest deal is labeled rumor/speculation, so no latest round fields were inferred. |
| Adaptive Security | https://pitchbook.com/profiles/company/680245-48 | Re-read full preview; website/domain match (PitchBook profile title is “Adaptive”); filled missing long description. Previously populated year founded, employees, HQ, sector/industry verticals, total raised, and Series B details retained. |
| Anima | https://pitchbook.com/profiles/company/459001-81 | Exact animahealth.com match; added description, 2019 founding year, 40 employees, London/UK HQ, HEALTHTECH sector, verticals, and profile provenance. |
| Mariana Minerals | https://pitchbook.com/profiles/company/820400-86 | Exact marianaminerals.com match; added description, 2024 founding year, 300 employees, San Francisco/California/US HQ, industry verticals, Series B1 ($310M, 2026-08-03), and profile provenance. Existing $310M total raised retained against PitchBook FAQ $394M. |
| Moove | https://pitchbook.com/profiles/company/462370-42 | Exact moove.io match; added description, 2020 founding year, 3,300 employees, Lagos/Nigeria HQ, FINTECH classification, industry verticals, Series C date/type (2026-08-05), and profile provenance. Existing $250M total raised retained against PitchBook FAQ $669M. |
| Gravis Robotics | https://pitchbook.com/profiles/company/516081-61 | Exact gravisrobotics.com match; added description, founded 2022, 74 employees, Zurich/Switzerland HQ, HARDWARE sector, industry verticals, Series A date/type (2026-08-17), and profile provenance. Existing $200M total raised retained against PitchBook FAQ $222M; upcoming M&A was not treated as completed. |
| Lumilens | https://pitchbook.com/profiles/company/686155-15 | Exact lumilens.com match; added description, founded 2024, 108 employees, San Jose/California/US HQ, AI/HARDWARE sectors, verticals, and Series C ($700M, 2026-08-06). Existing $700M total raised retained against PitchBook FAQ $834M. |
| Onyx Security | https://pitchbook.com/profiles/company/1161440-92 | Exact onyx.security match; added description, founded 2024, 80 employees, New York/US HQ, CYBERSECURITY and AI sectors, verticals, and Series B ($113M, 2026-07-08). Existing $113M total raised retained against PitchBook FAQ $153M. |
| Simile | https://pitchbook.com/profiles/company/893865-16 | Exact simile.com match; added description, founded 2025, 50 employees, Palo Alto/California/US HQ, AI sector, verticals, and Series B ($210M, 2026-09-22). Existing $200M total raised retained against PitchBook FAQ $310M. |
| Enigma | https://pitchbook.com/profiles/company/1461684-07 | Exact enigma.inc match; filled long description, founded 2023, Dover/Delaware/US HQ, and Seed round ($71M, 2026-07-27). Existing $70M total raised retained. No employee count was shown; industry mapping left blank. |
| Meshy | https://pitchbook.com/profiles/company/532823-68 | Exact meshy.ai match; filled description, founded 2022, 157 employees, Sunnyvale/California/US HQ, Series B ($400M, 2026-07-20), verticals, and profile provenance. Existing $400M total raised retained. |
| Tava Health | https://pitchbook.com/profiles/company/435274-75 | Completed; matched tavahealth.com; filled description, founded 2019, 181 employees, Salt Lake City HQ, and profile provenance. Retained existing $40M total raised rather than PitchBook FAQ $73M. |
| 1mind | https://pitchbook.com/profiles/company/1161342-37 | Completed; matched exact 1mind.com site and AI revenue-platform description among three same-name profiles; filled domain, profile provenance, sectors, and industry verticals. Existing founded year, headcount, and funding fields differ from PitchBook and were retained. |
| Linkup | https://pitchbook.com/profiles/company/708178-51 | Completed; exact linkup.so domain and AI search product match; filled description, founded 2024, $13.2M total raised, latest Seed ($9.9M on 2026-01-03), sectors, industry verticals, and profile provenance. Existing New York HQ and 38 headcount differ from PitchBook’s France/23 and were retained. |
| Lovable | https://pitchbook.com/profiles/company/600908-32 | Completed; exact AI app-builder match; filled description, founded 2024, Stockholm HQ, 250 employees, latest Series C ($400M on 2026-08-12), sectors, verticals, and profile provenance. Retained existing $400M total raised despite PitchBook FAQ reporting $1.05B. |
| Chatbase | https://pitchbook.com/profiles/company/608790-16 | Completed; exact chatbase.co domain match; filled description, founded 2022, San Francisco HQ, 40 employees, latest deal type Accelerator/Incubator, sectors, verticals, and profile provenance. PitchBook shows no latest deal amount/date; existing total raised remains blank. |
| Base44 | https://pitchbook.com/profiles/company/762528-25 | Completed; exact base44.com domain match; filled description, founded 2024, San Francisco HQ, 623 employees, sectors, verticals, and profile provenance. PitchBook records an acquisition by Wix on 2025-12-01, but this startup schema has no acquisition field; funding fields were left blank because the preview did not expose amounts/dates. |
| bolt.new / StackBlitz | https://pitchbook.com/profiles/company/226127-89 | Completed; VEKTA row's stackblitz.com domain matched PitchBook website, and the preview's LinkedIn link points to Bolt; filled description, founded 2017, San Francisco HQ, 20 employees, $135M total raised, latest Series B ($106M on 2025-01-22), sectors, verticals, and profile provenance. |
| Blacksmith | https://pitchbook.com/profiles/company/592686-19 | Completed; exact blacksmith.sh domain match; filled description, founded 2024, San Francisco HQ, 40 employees, latest Series C ($66.3M on 2026-10-21), sectors, verticals, and profile provenance. Retained existing $45M total raised despite PitchBook FAQ reporting $125M. |
| Antares Nuclear Inc. | https://pitchbook.com/profiles/company/539222-05 | Completed; PitchBook's former name Antares Industries and antaresindustries.com exactly match the VEKTA domain; filled description, founded 2023, Torrance HQ, 144 employees, latest Series C ($470M on 2026-07-27), sectors, verticals, and profile provenance. Retained existing $470M total raised despite PitchBook FAQ reporting $604M. |
| Reliable Robotics | https://pitchbook.com/profiles/company/186454-00 | Completed; matched reliable.co; filled description, founded 2017, 250 employees, Mountain View HQ, and profile provenance. Existing funding fields were retained. |
| Valerie Health | https://pitchbook.com/profiles/company/665105-59 | Completed; matched valeriehealth.com; filled description, 25 employees, Lafayette HQ, $38.9M total raised, industry tags, and profile provenance. Existing founded year and round fields were retained. |
| BoldVoice | https://pitchbook.com/profiles/company/466166-26 | Completed; exact boldvoice.com match; filled description, founded 2021, 10 employees, New York HQ, latest Series A1 ($21M, 2025-12-02), industry verticals, and profile provenance. Existing total-raised field was blank and PitchBook FAQ reports $26.3M. |
| Bluefish AI | https://pitchbook.com/profiles/company/599632-39 | Completed; exact bluefishai.com match; filled description, founded 2024, 90 employees, New York HQ, latest Series B ($43M, 2026-04-14), industry verticals, and profile provenance. Existing $43M total-raised value was retained; PitchBook FAQ reports $63M. |
| Also. | https://pitchbook.com/profiles/company/769655-53 | Completed; exact ridealso.com match; filled description, founded 2024, 353 employees, Palo Alto HQ, latest Series D ($150M, 2026-08-19), industry verticals, and profile provenance. Existing $200M total-raised value was retained; PitchBook FAQ reports $455M. |
| Higgsfield AI | https://pitchbook.com/profiles/company/541424-89 | Completed; exact higgsfield.ai domain; filled description, founded 2023, 160 employees, San Francisco HQ, latest Series B type/date (2026-10-23), AI/media sectors, verticals, and profile provenance. Retained existing $400M total raised; PitchBook FAQ reports $145M. Series B amount was not shown. |
| Wispr (Wispr Flow) | https://pitchbook.com/profiles/company/482540-68 | Completed; exact wisprflow.ai domain and former name match; filled description, founded 2021, 90 employees, San Francisco HQ, Series B ($280M, 2026-08-17), sectors/verticals, and PitchBook provenance. Retained existing $280M total raised although PitchBook FAQ says $359M. |
| Eleven Labs | https://pitchbook.com/profiles/company/509315-23 | Completed; exact elevenlabs.io match; filled description, founded 2022, 800 employees, New York HQ, $850M total raised, latest completed secondary transaction (2026-10-01), sectors/verticals, and PitchBook provenance. Rumored Series E excluded; existing stage retained. |
| Cursor | https://pitchbook.com/profiles/company/519419-89 | Completed; exact Cursor product and profile match; filled description, founded 2022, 700 employees, San Francisco HQ, total raised $3.38B, latest M&A ($60B, 2026-08-14), sectors/verticals, and PitchBook provenance. Existing stage/status retained. |
| WindBorne Systems | https://pitchbook.com/profiles/company/314957-53 | Completed; exact windbornesystems.com match; filled description, founded 2019, 96 employees, Redwood City HQ, latest Series B ($37M, 2026-08-05), industry verticals, and profile provenance. Existing $37M total-raised value was retained; PitchBook FAQ reports $61.9M. |
| Yuno | https://pitchbook.com/profiles/company/493444-90 | Completed; exact y.uno match; filled description, founded 2022, 100 employees, San Francisco HQ, latest Series B ($45M, 2026-08-17), industry verticals, and profile provenance. Existing $45M total-raised value was retained; PitchBook FAQ reports $80M. |
| Rainfall Ventures | https://pitchbook.com/profiles/investor/53345-35 | Re-read full preview; retained existing investing team count (3), portfolio count (64), and exits (59); filled the latest investment date (2026-09-01). Existing total headcount was left blank because the preview reports investing professionals, not total employees. |
| Norwest Venture Partners | https://pitchbook.com/profiles/investor/11258-83 | Completed full preview; matched legacy nvp.com records to Norwest (PitchBook website norwest.com; founded 1961; Menlo Park); added profile URL and counts of 86 professionals, 240 portfolio companies, and 469 exits to two near-duplicate VEKTA firm rows. |
| Kearny Jackson | https://pitchbook.com/profiles/investor/234169-21 | Re-read full preview; filled investing team count (2), portfolio count (57), and exits (19). Existing firm basics were already populated. |
| .406 Ventures | https://pitchbook.com/profiles/investor/42183-19 | Completed preview; exact website match; filled profile URL, investing professionals (12), portfolio count (55), and exits (62). Existing total headcount (27) was retained; PitchBook did not state total employee count. |
| Kearny Jackson | https://pitchbook.com/profiles/investor/234169-21 | Completed in earlier batch; verified |
| Rainfall Ventures | https://pitchbook.com/profiles/investor/53345-35 | Completed in earlier batch; verified |
| Vitalik Buterin (Individual) | https://pitchbook.com/profiles/investor/229091-59 | Completed; exact-name individual record matched; filled profile URL, website, Taipei/Taiwan office, paraphrased description, portfolio count (15), and exits (1). |
| Noubar Afeyan | https://pitchbook.com/profiles/investor/126193-51 | Completed; exact Flagship Pioneering person/title match; filled bio, short summary, and sourced background summary. Did not use PitchBook corporate-office address as personal location. |
| Arianna Simpson | https://pitchbook.com/profiles/investor/230386-51 | Completed; exact Andreessen Horowitz general-partner match; filled bio and sourced background summary. Existing short summary was retained, and PitchBook corporate-office address was not used as personal location. |
| Hunter Walk | https://pitchbook.com/profiles/investor/106116-67 | Completed; exact person match and Homebrew partner affiliation; filled bio, short summary, and sourced background summary. PitchBook corporate office was not saved as a personal location. |
| #ANGELS (Hashtag ANGELS) | https://pitchbook.com/profiles/investor/105834-34 | Completed; exact hashtagangels.com domain match; filled profile URL, U.S. HQ country, investing team count (6), portfolio count (12), and exits (14). Existing founded year and San Francisco HQ were retained. |

## Search preview only

| Record | PitchBook profile | Status |
| --- | --- | --- |
| Mercor | https://pitchbook.com/profiles/company/534425-05 | Reopened the full preview; existing description, founded year, employees, HQ, $519M total raised, profile link, and verticals match. Filled the empty sector array with AI and ENTERPRISE_SAAS. Rumored later-stage round excluded. |
| .406 Ventures | https://pitchbook.com/profiles/investor/42183-19 | Re-read full preview: 12 investing professionals, 234 investments, 55 portfolio companies, and 62 exits. No supported blank field to fill; retained existing total_headcount=27 because PitchBook’s professional count is not total employee count. |

## Skipped or pending match

| Record/query | Status | Reason |
| --- | --- | --- |
| Blossom | Skipped | PitchBook result described an ethical investment platform; VEKTA record website is a health company. |
| Jack Soslow (Andreessen Horowitz) | Pending | Playwright site search returned no PitchBook investor preview. |
| Justin Larkin (Andreessen Horowitz) | Pending | Playwright site search returned no PitchBook investor preview. |
| Annie Collins (Andreessen Horowitz) | Pending | Playwright site search returned no PitchBook investor preview. |
| Alma | Skipped | PitchBook Alma Health profile is a closed Abu Dhabi company at almahealth.io; VEKTA points to helloalma.com, so no match. |
| Rivan | Skipped | PitchBook result described undisclosed services in Belgium; VEKTA record points to rivan.com. |
| Method | Skipped | PitchBook result was an esports/media company; VEKTA record points to Method Financial. |
| Cursor | Enriched | Later Playwright search found exact Cursor profile 519419-89; matched the Cursor company row and PitchBook website. Filled description, 2022 founding year, 700 employees, San Francisco HQ, $3.38B total raised, latest M&A ($60B, 2026-08-14), AI/SaaS sectors, verticals, and profile provenance. Existing BOOTSTRAPPED stage and ACTIVE status retained. |
| Fern | Skipped | Search result was Fern Trading, not the developer-tools startup. |
| Eleven Labs | Enriched | Exact elevenlabs.io PitchBook profile 509315-23; filled description, 2022 founding year, 800 employees, New York HQ, $850M total raised, latest completed secondary transaction date/type, AI/SaaS sectors, verticals, and profile provenance. Rumored Series E was excluded. Existing BOOTSTRAPPED stage retained. |
| Testimonial | Skipped | Search returned Testimonial Tree; match to testimonial.to was not conclusive. |
| Gamma | Skipped | Search returned Gamma Diagnostics, not the presentation software company. |
| Magnific | Skipped | Search returned a Spanish visual-content database; match to the AI image product was not conclusive. |
| Rendernet AI | Skipped | Search returned Affogato, a different AI image/video company. |
| Cal AI | Skipped | Search returned Calm Air International. |
| Attention | Skipped | Search returned Attention Partners, a marketing firm, not the AI sales product. |
| Frazier Life Sciences | Skipped | Search returned Frazier Healthcare Partners, a different organization; no match made. |
| Z47 | Profile found; skipped | PitchBook profile 87534-82 was verified, but no exact-name or confirmed-alias VEKTA firm record was found. |
| Amigo (amigo.ai) | Skipped | Playwright search found AmigoAI at amigoai.rapra.in, which does not match the VEKTA amigo.ai domain; no write made. |
| Abhishek Malani (Sequoia Capital) | Pending | Playwright exact-name investor-profile search returned no PitchBook result. No individual profile write made. |
| Sonali Singh (Sequoia Capital) | Pending | Playwright Google site search for the exact investor name and firm returned no PitchBook preview. No individual profile write made. |
| Suneel Gokhale | Pending | Playwright Google exact-name `site:pitchbook.com/profiles/investor` search returned no PitchBook preview. No person record updated. |
| Ada Yin (Airtree Ventures) | Pending | Playwright exact-name PitchBook investor-profile search returned no result. No write made. |
| Aaron Rosenson (Insight Partners) | Pending | Playwright exact-name PitchBook investor-profile search returned no result. No write made. |
| Adam S. Lasri (Atomico) | Pending | Rechecked with a Playwright Google site search for an investor profile; no PitchBook result surfaced. No write made. |
| Adam R. Fisher (Bessemer Venture Partners) | Pending | Playwright PitchBook site search returned no individual preview; a broader search returned only the firm profile. |
| Hilary Gosher (Insight Partners) | Pending | Rechecked with a Playwright Google site search for an investor profile; no PitchBook result surfaced. No write made. |
| Patrick Theander (The Aventures Fund) | Pending | Playwright PitchBook site search returned no matching individual preview. |
| Amity Solutions | Pending | Playwright PitchBook site search for amitysolutions.com returned no exact preview. |
| Magic (magic.vc) | Pending | Playwright search found Magic Ventures and Magic Venture Capital previews, but their locations and founding dates did not match the VEKTA firm record. |
| Arcads | Pending | Playwright search for the exact arcads.ai company returned no PitchBook profile preview; results were unrelated Arcade/ArcOne companies. |
| Velaura AI | Pending | Playwright PitchBook site search for velaura.ai returned no profile preview. |
| Atoms (atoms.co) | Skipped | Playwright search returned Atoms software-development and footwear profiles, but neither matched the VEKTA description or exact atoms.co domain. |
| Augustus Healthcare Solutions | Skipped | Playwright search surfaced an unrelated Augustus profile and other companies; no exact company preview/domain match. |

| VSTRAT.ai | Pending | Exact site search returned unrelated results only; no exact PitchBook preview. |
| DittoDub | Pending | No PitchBook search result. |
| Submagic | Pending | No PitchBook search result. |

| Breakthrough Energy Ventures | Pending | Earlier PitchBook site search returned individual profiles but no firm preview; no write made. |
| Jasmi Shah (Alumni Ventures Group) | Pending | Playwright Google `site:pitchbook.com/profiles/investor` search with exact name and firm returned no PitchBook result. No write made. |
| Bill Raduchel (Individual) | Pending | Playwright Google `site:pitchbook.com/profiles/investor` search for exact name returned no PitchBook result. No write made. |
| Portage Ventures | Enriched with location conflict retained | Playwright preview 167212-00 matches name, 2016 founding year, and fintech description; stored PitchBook URL, 35 professionals, 135 portfolio companies, and 39 exits. Existing New York/US location retained despite PitchBook Toronto/Canada profile. |
| Atreides Management | Pending | Playwright PitchBook site search and a follow-up Google `site:pitchbook.com/profiles/investor` search for `atreidesmgmt.com` returned no exact organization preview; no profile fields written. |
| Entrepreneur First | Enriched with location conflict retained | Playwright domain search found profile 64215-37 at joinef.com, exact name/domain match; added URL, founding year 2011, 44 professionals, 521 portfolio companies, and 355 exits. Retained conflicting preexisting Paris/Ontario/France location. |
| Standard Capital (California) exits | Pending | Existing linked profile confirms 3 professionals, 19 investments, and 17 portfolio companies, but the Exits tab is locked in the preview; exited-portfolio count remains blank. |
| Greylock Partners | Skipped | Two same-name rows have no website or location to distinguish; no write to the duplicate. |
| Vertex Ventures | Skipped | Exact-name duplicate represents another geographic entity; the VEKTA US record already has the confirmed profile. |
| Altimeter Capital | Skipped | Duplicate row has a challenge-placeholder website; the matching altimeter.com row already has the confirmed profile. |
| South Park Commons | Skipped | Exact-name row has capitalapartners.com and NYC/2013, conflicting with the profile's southparkcommons.co and San Francisco/2016; no write. |
| Square Peg Capital | Skipped | Two rows have conflicting geography and websites; no unique target. |
| SR One | Skipped | Duplicate exact-name row has placeholder website and conflicting location; the srone.com `SR One by GSK` row is enriched. |
| Norwest Venture Partners | Completed | PitchBook profile 11258-83 matched both active nvp.com legacy-domain rows; stored profile URL and preview counts on both. |
| DCVC (Data Collective) | Skipped | Two DCVC rows share dcvc.com with conflicting founding years/locations; no unique row. |
| Flex Capital | Skipped | VEKTA row describes a Berlin firm, while the found PitchBook profile is the San Francisco VC. |
| Conviction | Skipped | Conviction Partners matches conviction.com; this separate VEKTA row points to conviction-sfo.com and is not the same firm. |
| Lakestar | Skipped | Three candidate VEKTA records prevent a unique match. |
| Frazier Life Sciences | Skipped | Search returned Frazier Healthcare Partners, a different firm. |

| ZhenFund | https://pitchbook.com/profiles/investor/55778-14 | Re-read full preview; filled missing HQ city (Beijing) and latest investment date (2026-10-17). Existing China country, 21 investing professionals, 592 portfolio companies, and 251 exits retained. Total headcount and partner count remain blank because the preview gives no equivalent values. |
| SBI Investment | https://pitchbook.com/profiles/investor/95034-70 | Re-read full preview; filled description, founded 1996, Tokyo/Japan HQ, and latest investment date (2026-10-01). Existing headcount (123), 14 investing professionals, 381 portfolio companies, and 212 exits retained. |
| Genesia Ventures | https://pitchbook.com/profiles/investor/227478-07 | Re-read full preview; filled description and latest investment date (2026-10-16). Existing Tokyo/Japan HQ, 2016 founding year, 14 investing professionals, 161 portfolio companies, and 40 exits retained. Total headcount left blank; the preview reports investing professionals. |
| Menlo Ventures | https://pitchbook.com/profiles/investor/11242-54 | Re-read full preview; filled missing state/country (California/US) and latest investment date (2026-10-28). Kept existing Menlo Park HQ city despite PitchBook listing San Francisco. Total headcount left blank; the preview reports 27 investing professionals. |
| Madrona Venture Group | https://pitchbook.com/profiles/investor/11229-85 | Re-read full preview; filled missing state/country (Washington/US) and latest investment date (2026-10-06). Existing Seattle HQ city, 1995 founding year, 28 investing professionals, 138 portfolio companies, and 208 exits retained. |
| Pear VC | https://pitchbook.com/profiles/investor/58373-20 | Re-read the exact pear.vc profile (PitchBook title Pear (California)); filled missing HQ country (US) and latest investment date (2026-10-23). Existing San Francisco/California location, 2013 founding year, 14 professionals, 252 portfolio companies, and 160 exits retained. |

| Andreessen Horowitz | https://pitchbook.com/profiles/investor/41716-90 | Re-read full preview; filled missing most recent investment date (2026-11-02). |
| Index Ventures | https://pitchbook.com/profiles/investor/11216-98 | Re-read full preview; filled missing most recent investment date (2026-10-21). |
| 01 Advisors | https://pitchbook.com/profiles/investor/229771-45 | Re-read full preview; filled missing most recent investment date (2026-10-22). |
| Kleiner Perkins | https://pitchbook.com/profiles/investor/11228-50 | Re-read full preview; filled missing most recent investment date (2026-10-21). |
| 500 Global | https://pitchbook.com/profiles/investor/51006-88 | Re-read full preview; filled missing most recent investment date (2026-10-13). |
| New Enterprise Associates (NEA) | https://pitchbook.com/profiles/investor/11251-81 | Re-read full preview; filled missing most recent investment date (2026-10-19). |
| Accel | https://pitchbook.com/profiles/investor/10139-41 | Re-read full preview; filled missing most recent investment date (2026-10-27). |
| Battery Ventures | https://pitchbook.com/profiles/investor/10052-20 | Re-read full preview; filled missing most recent investment date (2026-10-20). |
| Commonwealth Fusion Systems | https://pitchbook.com/profiles/company/226641-88 | Exact cfs.energy match; filled description, founded 2018, 1,500 employees, Devens/Massachusetts/US HQ, Alternative Energy Equipment mapped to CLIMATE, CleanTech/Climate Tech verticals, and Series B2 ($1B, 2026-08-19). Existing $1B total-raised value retained against PitchBook FAQ $3.95B; profile provenance stored. |

| .406 Ventures | https://pitchbook.com/profiles/investor/42183-19 | Re-read preview; filled blank most recent investment date (2026-10-07). |
| 100X.VC | https://pitchbook.com/profiles/investor/277319-62 | Re-read preview; filled blank most recent investment date (2026-10-06). |
| 20VC | https://pitchbook.com/profiles/investor/108618-40 | Re-read preview; filled blank most recent investment date (2026-10-05). |
| 3one4 Capital | https://pitchbook.com/profiles/investor/154351-72 | Re-read preview; filled blank most recent investment date (2026-10-29). |
| 468 Capital | https://pitchbook.com/profiles/investor/434673-19 | Re-read preview; filled blank most recent investment date (2026-10-19). |
| 5AM Ventures | https://pitchbook.com/profiles/investor/11104-03 | Re-read preview; filled blank most recent investment date (2026-10-19). |
| 8VC | https://pitchbook.com/profiles/investor/149720-23 | Re-read preview; filled blank most recent investment date (2026-10-29). |
| Abstract Ventures | https://pitchbook.com/profiles/investor/179440-93 | Re-read preview; filled blank most recent investment date (2026-10-29). |
| Acequia Capital | https://pitchbook.com/profiles/investor/55271-44 | Re-read preview; filled blank most recent investment date (2026-09-03). |
| Airtree Ventures | https://pitchbook.com/profiles/investor/100778-23 | Re-read preview; filled blank most recent investment date (2026-10-28). |
| AlbionVC | https://pitchbook.com/profiles/investor/233965-45 | Re-read preview; filled blank most recent investment date (2026-09-22). |
| AlleyCorp | https://pitchbook.com/profiles/investor/108968-59 | Re-read preview; filled blank most recent investment date (2026-10-02). |
| Suneel Gokhale | — | Google Playwright query for an exact PitchBook investor preview returned no result; no profile fields updated. |
| DeepX Co. | https://pitchbook.com/profiles/company/466596-82 | Exact deepx.ai match; filled long description, 2018 founding year, 128 employees, Seongnam/Gyeonggi/South Korea HQ, hardware and AI sectors, PitchBook verticals, and profile provenance. Existing short description and $29M raised retained. |

| Insight Partners | https://pitchbook.com/profiles/investor/10331-11 | Re-read linked preview; filled blank most recent investment date (2026-10-27). |
| Flare Capital Partners | https://pitchbook.com/profiles/investor/126812-62 | Re-read linked preview; filled blank most recent investment date (2026-10-13). |
| Oak HC/FT | https://pitchbook.com/profiles/investor/87063-49 | Re-read linked preview; filled blank most recent investment date (2026-10-06). |
| SignalFire | https://pitchbook.com/profiles/investor/60622-12 | Re-read linked preview; filled blank most recent investment date (2026-10-22). Existing challenge-placeholder website retained. |
| S3 Ventures, Bain Capital Ventures, XYZ Venture Capital, Headline, Canaan Partners, Z Venture Capital, Lux Capital, Union Square Ventures | — | Re-read linked previews; no latest-investment date was exposed in the preview text, so no date writes were made. |

| F-Prime Capital | https://pitchbook.com/profiles/investor/124929-64 | Re-read linked preview; filled missing founding year (1969), HQ country (US), and latest investment date (2026-10-20). Investing professionals (44) retained as separate team metric, not total headcount. |
| Global Brain | https://pitchbook.com/profiles/investor/52202-35 | Re-read linked preview; filled missing latest investment date (2026-10-30). No state or total headcount inferred for Tokyo-based firm. |
| Liquid 2 Ventures | https://pitchbook.com/profiles/investor/149517-28 | Re-read linked preview; filled missing HQ country (US) and latest investment date (2026-09-22); conflicting existing state retained. |
| Standard Capital | https://pitchbook.com/profiles/investor/864853-66 | Re-read linked preview; filled missing latest investment date (2026-10-29). Preview reports 3 professionals; did not infer total headcount or exits. |
| Beenext | https://pitchbook.com/profiles/investor/153309-25 | Re-read linked preview; filled missing latest investment date (2026-10-14). Singapore country retained; did not infer state or total headcount. |
| Atinum Investment | https://pitchbook.com/profiles/investor/10594-72 | Re-read linked preview; filled missing founding year (1988) and latest investment date (2026-10-30). |
| Foundation Capital | https://pitchbook.com/profiles/investor/11193-13 | Re-read linked preview; filled missing HQ country (US) and latest investment date (2026-10-28). |
| Meritech Capital Partners | https://pitchbook.com/profiles/investor/11240-47 | Re-read linked preview; filled missing HQ state/country (California/US) and latest investment date (2026-10-21). |
| Point72 Ventures | https://pitchbook.com/profiles/investor/170055-28 | Re-read linked preview; filled missing latest investment date (2026-10-02). Conflicting existing Stamford/Texas location fields were retained. |
| LocalGlobe | https://pitchbook.com/profiles/investor/148770-82 | Re-read preview is titled Phoenix Court and shows Phoenix Court's latest investment; skipped further writes because its firm identity/brand metrics cannot safely be treated as LocalGlobe-only values. |

| Adam R. Fisher (Bessemer Venture Partners) | — | Playwright Google query for an exact PitchBook investor preview returned no result; no person fields updated. |
| Adam Lasri (Atomico) | — | Playwright Google query for an exact PitchBook investor preview returned no result; no person fields updated. |
| Abby Scarborough (M13) | — | Playwright Google query for an exact PitchBook investor preview returned no result; no person fields updated. |

| Gecko Robotics | https://pitchbook.com/profiles/company/155872-18 | Exact geckorobotics.com match; added long description, 2013 founding year, 320 employees, Pittsburgh/Pennsylvania/US HQ, robotics/industrial/AI sectors, verticals, and profile provenance. Added completed Series D ($125M, 2025-06-12); no cumulative raised amount inferred. |
| Firmus Technologies | https://pitchbook.com/profiles/company/501786-82 | Exact firmus.co match; added long description, 2019 founding year, 116 employees, Sydney/New South Wales/Australia HQ, AI/industrial/climate sectors, verticals, and profile provenance. Latest listed IPO is cancelled, so no latest-round fields were written. |
| Clickup | https://pitchbook.com/profiles/company/157707-28 | Exact clickup.com match; added long description, 1,244 employees, San Diego/California/US HQ, enterprise SaaS sector, verticals, and profile provenance. Added completed Series C ($400M, 2021-10-27); founding year was not present in the preview. |
| Doctronic | https://pitchbook.com/profiles/company/624171-25 | Exact doctronic.ai match; added long description, 2023 founding year, 4 employees, New York/US HQ, healthtech/AI sectors, verticals, and profile provenance. Added completed Series B ($40M, 2026-02-12); existing $40M total raised retained. |
| Cape | https://pitchbook.com/profiles/company/503054-83 | Exact cape.co match; added long description, 2022 founding year, 177 employees, Arlington/Virginia/US HQ, cybersecurity/mobility sectors, verticals, and profile provenance. Added completed Series C ($100M, 2026-07-28); existing $100M total raised retained. |
| Attention | https://pitchbook.com/profiles/company/491367-52 | Exact attention.com match; added long description, 2021 founding year, 94 employees, New York/US HQ, AI/enterprise SaaS sectors, verticals, and profile provenance. Added completed Series B ($30M, 2026-06-23). |

| #ANGELS (Hashtag ANGELS) | https://pitchbook.com/profiles/investor/105834-34 | Re-read linked preview; filled blank most recent investment date (2026-02-23). |
| Altimeter | https://pitchbook.com/profiles/investor/42770-53 | Re-read linked preview; filled blank most recent investment date (2026-10-20). |
| Amplify Partners | https://pitchbook.com/profiles/investor/55612-00 | Re-read linked preview; filled blank most recent investment date (2026-10-27). |
| ARCH Venture Partners | https://pitchbook.com/profiles/investor/11111-68 | Re-read linked preview; filled blank most recent investment date (2026-10-13). |
| Atomico | https://pitchbook.com/profiles/investor/40732-48 | Re-read linked preview (PitchBook title: Atomico (UK) Partners); filled blank most recent investment date (2026-10-12). |
| B Capital Group | https://pitchbook.com/profiles/investor/155248-48 | Re-read linked preview; filled blank most recent investment date (2026-10-27). |
| Bain Capital Ventures | https://pitchbook.com/profiles/investor/42202-18 | Re-read linked preview; filled blank most recent investment date (2026-10-21). |
| Base10 Partners | https://pitchbook.com/profiles/investor/167562-37 | Re-read linked preview; filled blank most recent investment date (2026-10-28). |
| Benchmark | https://pitchbook.com/profiles/investor/11133-01 | Re-read linked preview (PitchBook title: Benchmark Capital Holdings); filled blank most recent investment date (2026-10-21). |
| Bessemer Venture Partners | https://pitchbook.com/profiles/investor/10134-73 | Re-read linked preview; filled blank most recent investment date (2026-10-26). |
| Better Tomorrow Ventures | https://pitchbook.com/profiles/investor/343469-35 | Re-read linked preview; filled blank most recent investment date (2026-10-22). |
| Blackbird Ventures, Bloomberg Beta, Blumberg Capital, BoxGroup | — | Re-read linked previews; no latest-investment date surfaced in the preview text, so no date writes were made. |

| Claros | https://pitchbook.com/profiles/company/707461-30 | Exact claros.tech match; added long description, 2024 founding year, 49 employees, Torrance/California/US HQ, AI/climate sectors, verticals, and profile provenance. Added Series B1 date (2026-03-19); later completed acquisition was not treated as a funding round. Existing $30M total raised retained. |
| Deeptune | https://pitchbook.com/profiles/company/534551-32 | Exact deeptune.com match; added long description, 2022 founding year, 25 employees, New York/US HQ, AI sector/vertical, and profile provenance. Added Series A date (2026-03-19); later completed merger/acquisition was not treated as a financing round. Existing $43M total raised retained. |
| depthfirst | https://pitchbook.com/profiles/company/731208-70 | Exact depthfirst.com match; added long description, 2024 founding year, 25 employees, San Francisco/California/US HQ, cybersecurity/AI sectors, verticals, profile provenance, and completed Series B ($80M, 2026-03-31). Existing $120M total raised retained. |
| DOSS.COM | https://pitchbook.com/profiles/company/522883-99 | Exact doss.com match; added long description, 2022 founding year, 139 employees, San Francisco/California/US HQ, enterprise SaaS/AI/fintech/industrial sectors, verticals, profile provenance, and completed Series B ($55M, 2026-03-24). Existing $55M total raised retained. |
| Avoca | https://pitchbook.com/profiles/company/521930-62 | Exact avoca.ai match; added long description, 2022 founding year, 158 employees, New York/US HQ, AI/enterprise SaaS sectors, verticals, profile provenance, and completed Series B ($77.2M, 2026-04-27). |
| Blossom | https://pitchbook.com/profiles/company/701342-74 | Exact joinblossomhealth.com match; added long description, 2024 founding year, 39 employees, New York/US HQ, healthtech/AI sectors, verticals, profile provenance, and completed Series A ($18.4M, 2026-03-26). |
| Cal AI | https://pitchbook.com/profiles/company/770166-91 | Exact calai.app match; added long description, 2024 founding year, 30 employees, Roslyn/New York/US HQ, AI/consumer/healthtech sectors, verticals, and profile provenance. PitchBook identifies it as an acquired operating subsidiary; existing status was not overwritten. |
| GRAVITY | — | Exact-domain search surfaced an IRIS. profile with website trygravity.com, while the VEKTA record is named GRAVITY and uses trygravity.ai; skipped because the brand/domain relationship was not sufficiently clear for a write. |
| Amity | — | Exact-domain Playwright PitchBook search returned no profile preview; no fields updated. |

| Atoms | https://pitchbook.com/profiles/company/226937-62 | Exact atoms.co match; added long description, 2016 founding year, 2,000 employees, Los Angeles/California/US HQ, industrial/AI/robotics sectors, vertical, and profile provenance. Added the latest completed Later Stage VC date (2026-07-22); postponed IPO was not treated as a completed round. Existing $1.7B total raised retained. |
| Cents | https://pitchbook.com/profiles/company/433687-96 | Exact trycents.com match; added long description, 2018 founding year, 107 employees, New York/US HQ, enterprise SaaS sector, verticals, profile provenance, and completed Series C ($140M, 2026-03-26). Existing $110M total raised retained. |
| ChipAgents | https://pitchbook.com/profiles/company/686587-96 | Exact chipagents.ai match; added long description, 2024 founding year, 65 employees, San Jose/California/US HQ, AI/hardware sectors, verticals, profile provenance, and completed Series A2 ($134M, 2026-07-29). Existing $60M total raised retained. |
| Freehand | https://pitchbook.com/profiles/company/1462133-26 | Exact freehand.ai match; added long description, 2024 founding year, 132 employees, Chicago/Illinois/US HQ, AI/fintech/supply-chain sectors, verticals, profile provenance, and completed Early Stage VC ($75M, 2026-07-29). Existing $75M total raised retained. |
| FlyCode | https://pitchbook.com/profiles/company/489614-50 | Exact flycode.com match; added long description, 2021 founding year, 7 employees, New York/US HQ, fintech/AI/enterprise SaaS sectors, verticals, profile provenance, and latest completed grant ($100K, 2024-10-29). |
| Glimpse | https://pitchbook.com/profiles/company/442603-00 | Exact tryglimpse.com match; added long description, 2020 founding year, 44 employees, San Francisco/California/US HQ, fintech/AI/enterprise SaaS sectors, verticals, profile provenance, and completed Series B ($35M, 2026-03-13). Existing $35M total raised retained. |
| Augustus | — | Exact-domain Playwright PitchBook search returned no profile preview; no fields updated. |
| Amigo | — | Exact-domain search returned multiple same-name profiles without a confirmed amigo.ai domain match; no fields updated. |

| Abhiram Kannan (Anzu Partners) | — | Playwright Google exact-name PitchBook investor-profile search returned no result; no person fields updated. |

### Latest firm-date tranche (16 verified previews)

| Firm | PitchBook profile | Update |
| --- | --- | --- |
| Ribbit Capital | [55346-14](https://pitchbook.com/profiles/investor/55346-14) | Filled blank most recent investment date (2026-10-26). |
| RTP Global | [52304-50](https://pitchbook.com/profiles/investor/52304-50) | Filled blank most recent investment date (2026-10-05). |
| S3 Ventures | [42943-96](https://pitchbook.com/profiles/investor/42943-96) | Filled blank most recent investment date (2026-10-20). |
| Sapphire Ventures | [11293-66](https://pitchbook.com/profiles/investor/11293-66) | Filled blank most recent investment date (2026-10-22). |
| Seedcamp | [51064-84](https://pitchbook.com/profiles/investor/51064-84) | Filled blank most recent investment date (2026-11-02). |
| Sequoia Capital | [11295-73](https://pitchbook.com/profiles/investor/11295-73) | Filled blank most recent investment date (2026-10-29). |
| Slow Ventures | [54207-19](https://pitchbook.com/profiles/investor/54207-19) | Filled blank most recent investment date (2026-10-28). |
| Sofinnova Partners | [11300-05](https://pitchbook.com/profiles/investor/11300-05) | Filled blank most recent investment date (2026-10-26). |
| Soma Capital | [110937-70](https://pitchbook.com/profiles/investor/110937-70) | Filled blank most recent investment date (2026-10-20). |
| SOSV | [51322-24](https://pitchbook.com/profiles/investor/51322-24) | Filled blank most recent investment date (2026-10-30). |
| Spark Capital | [11303-02](https://pitchbook.com/profiles/investor/11303-02) | Filled blank most recent investment date (2026-10-22). |
| SR One by GSK | [11304-55](https://pitchbook.com/profiles/investor/11304-55) | Filled blank most recent investment date (2026-10-29). |
| Susa Ventures | [60139-90](https://pitchbook.com/profiles/investor/60139-90) | Filled blank most recent investment date (2026-10-20). |
| SV Angel | [50980-60](https://pitchbook.com/profiles/investor/50980-60) | Filled blank most recent investment date (2026-10-29). |
| Team8 | [108037-45](https://pitchbook.com/profiles/investor/108037-45) | Filled blank most recent investment date (2026-08-31). |
| Tenaya Capital | [40764-07](https://pitchbook.com/profiles/investor/40764-07) | Filled blank most recent investment date (2025-04-30). |

### Latest firm-date tranche (5 verified previews)

| Firm | PitchBook profile | Update |
| --- | --- | --- |
| Portage Ventures | [167212-00](https://pitchbook.com/profiles/investor/167212-00) | Filled blank most recent investment date (2026-10-29); preview website portageinvest.com with prior confirmed profile match. |
| Precursor Ventures | [125084-71](https://pitchbook.com/profiles/investor/125084-71) | Filled blank most recent investment date (2026-10-20). |
| QED Investors | [50943-70](https://pitchbook.com/profiles/investor/50943-70) | Filled blank most recent investment date (2026-09-30). |
| Reach Capital | [111506-59](https://pitchbook.com/profiles/investor/111506-59) | Filled blank most recent investment date (2026-10-20). |
| Redpoint Ventures | [11281-06](https://pitchbook.com/profiles/investor/11281-06) | Filled blank most recent investment date (2026-10-29). |

### Latest firm-date tranche (19 verified record updates)

| Firm | PitchBook profile | Update |
| --- | --- | --- |
| Lerer Hippeau | [50980-69](https://pitchbook.com/profiles/investor/50980-69) | Filled blank most recent investment date (2026-10-29). |
| LG Technology Ventures | [234526-87](https://pitchbook.com/profiles/investor/234526-87) | Filled blank most recent investment date (2026-10-21). |
| Lightspeed Venture Partners | [11333-26](https://pitchbook.com/profiles/investor/11333-26) | Filled blank most recent investment date (2026-10-29); PitchBook profile and lsvp.com root match the record's gaming.lsvp.com subdomain. |
| Lowercarbon Capital | [277115-14](https://pitchbook.com/profiles/investor/277115-14) | Filled blank most recent investment date (2026-10-29). |
| Lux Capital | [11229-04](https://pitchbook.com/profiles/investor/11229-04) | Filled blank most recent investment date (2026-10-30). |
| M13 | [160610-32](https://pitchbook.com/profiles/investor/160610-32) | Filled blank most recent investment date (2026-10-09). |
| MaC Venture Capital | [267599-80](https://pitchbook.com/profiles/investor/267599-80) | Filled blank most recent investment date (2026-10-28). |
| Maverick Ventures | [181009-27](https://pitchbook.com/profiles/investor/181009-27) | Filled blank most recent investment date (2026-09-09). |
| Mayfield Fund | [11237-95](https://pitchbook.com/profiles/investor/11237-95) | Filled blank most recent investment date (2026-10-01). |
| Nexus Venture Partners | [11254-42](https://pitchbook.com/profiles/investor/11254-42) | Filled blank most recent investment date (2026-10-27). |
| NFX | [124319-53](https://pitchbook.com/profiles/investor/124319-53) | Filled blank most recent investment date (2026-10-13). |
| Northzone | [11258-56](https://pitchbook.com/profiles/investor/11258-56) | Filled blank most recent investment date (2026-10-14). |
| Norwest Venture Partners and NVP Norwest Venture Partners | [11258-83](https://pitchbook.com/profiles/investor/11258-83) | Filled both linked duplicate rows with the same profile-backed date (2026-10-28). |
| Notion Capital | [51311-35](https://pitchbook.com/profiles/investor/51311-35) | Filled blank most recent investment date (2026-10-28); notion.vc record matched despite PitchBook listing notioncapital.com. |
| Pantera Capital | [60945-31](https://pitchbook.com/profiles/investor/60945-31) | Filled blank most recent investment date (2026-10-15). |
| Paradigm | [233744-05](https://pitchbook.com/profiles/investor/233744-05) | Filled blank most recent investment date (2026-10-22). |
| Partech Partners | [11268-55](https://pitchbook.com/profiles/investor/11268-55) | Filled blank most recent investment date (2026-10-06). |
| Pi Labs | [97882-39](https://pitchbook.com/profiles/investor/97882-39) | Filled blank most recent investment date (2026-10-13). |

### Latest firm-date update (1 verified preview)

| Firm | PitchBook profile | Update |
| --- | --- | --- |
| Greenoaks Capital | [54855-55](https://pitchbook.com/profiles/investor/54855-55) | Filled blank most recent investment date (2026-10-21). |

### Latest firm-date tranche (6 verified previews)

| Firm | PitchBook profile | Update |
| --- | --- | --- |
| Gaingels | [124929-82](https://pitchbook.com/profiles/investor/124929-82) | Filled blank most recent investment date (2026-10-28). |
| General Catalyst | [10123-03](https://pitchbook.com/profiles/investor/10123-03) | Filled blank most recent investment date (2026-11-02). |
| Georgian | [40431-25](https://pitchbook.com/profiles/investor/40431-25) | Filled blank most recent investment date (2026-10-26). |
| Goodwater Capital | [64182-25](https://pitchbook.com/profiles/investor/64182-25) | Filled blank most recent investment date (2026-10-08). |
| Gorilla Capital | [85287-70](https://pitchbook.com/profiles/investor/85287-70) | Filled blank most recent investment date (2026-11-02); exact gorillacapital.fi/Helsinki profile. |
| Gradient Ventures | [183174-31](https://pitchbook.com/profiles/investor/183174-31) | Filled blank most recent investment date (2026-10-28). |

### Latest firm-date tranche (13 verified previews)

| Firm | PitchBook profile | Update |
| --- | --- | --- |
| Eclipse | [126290-08](https://pitchbook.com/profiles/investor/126290-08) | Filled blank most recent investment date (2026-10-26); matched eclipse.capital. |
| Emergence Capital | [11171-44](https://pitchbook.com/profiles/investor/11171-44) | Filled blank most recent investment date (2026-10-28); emcap.com match. |
| Entrepreneur First | [64215-37](https://pitchbook.com/profiles/investor/64215-37) | Filled blank most recent investment date (2026-10-22); joinef.com match. |
| EQT Ventures | [155247-58](https://pitchbook.com/profiles/investor/155247-58) | Filled blank most recent investment date (2026-09-30). |
| Felicis Ventures | [42715-00](https://pitchbook.com/profiles/investor/42715-00) | Filled blank most recent investment date (2026-10-30). |
| Fifth Wall | [167492-08](https://pitchbook.com/profiles/investor/167492-08) | Filled blank most recent investment date (2026-10-23). |
| First Round Capital | [11189-44](https://pitchbook.com/profiles/investor/11189-44) | Filled blank most recent investment date (2026-10-30). |
| FirstMark Capital | [11270-53](https://pitchbook.com/profiles/investor/11270-53) | Filled blank most recent investment date (2026-10-20). |
| Flagship Pioneering | [11262-52](https://pitchbook.com/profiles/investor/11262-52) | Filled blank most recent investment date (2026-10-06). |
| Flybridge | [11215-63](https://pitchbook.com/profiles/investor/11215-63) | Filled blank most recent investment date (2026-10-16). |
| Forerunner Ventures | [52507-90](https://pitchbook.com/profiles/investor/52507-90) | Filled blank most recent investment date (2026-10-29). |
| Founders Fund | [11315-62](https://pitchbook.com/profiles/investor/11315-62) | Filled blank most recent investment date (2026-10-21). |
| FPV Fund | [499888-72](https://pitchbook.com/profiles/investor/499888-72) | Filled blank most recent investment date (2026-09-23). |

### Latest firm-date tranche (7 verified previews)

| Firm | PitchBook profile | Update |
| --- | --- | --- |
| Costanoa Ventures | [54613-90](https://pitchbook.com/profiles/investor/54613-90) | Filled blank most recent investment date (2026-09-22). |
| Crane Venture Partners | [187432-21](https://pitchbook.com/profiles/investor/187432-21) | Filled blank most recent investment date (2026-10-27). |
| Crosslink Capital | [11261-89](https://pitchbook.com/profiles/investor/11261-89) | Filled blank most recent investment date (2026-10-14). |
| CRV | [10133-20](https://pitchbook.com/profiles/investor/10133-20) | Filled blank most recent investment date (2026-10-22). |
| Cyberstarts | [43076-53](https://pitchbook.com/profiles/investor/43076-53) | Filled blank most recent investment date (2026-09-24). |
| Draper Associates | [56010-97](https://pitchbook.com/profiles/investor/56010-97) | Filled blank most recent investment date (2026-10-16). |
| Earlybird Venture Capital | [11159-74](https://pitchbook.com/profiles/investor/11159-74) | Filled blank most recent investment date (2026-10-21). |

### Latest firm-date tranche (9 verified previews)

| Firm | PitchBook profile | Update |
| --- | --- | --- |
| Blackbird Ventures | [56336-41](https://pitchbook.com/profiles/investor/56336-41) | Filled blank most recent investment date (2026-10-29). |
| Bloomberg Beta | [83135-44](https://pitchbook.com/profiles/investor/83135-44) | Filled blank most recent investment date (2026-10-28). |
| Blumberg Capital | [11127-25](https://pitchbook.com/profiles/investor/11127-25) | Filled blank most recent investment date (2026-09-22). |
| BoxGroup | [56833-03](https://pitchbook.com/profiles/investor/56833-03) | Filled blank most recent investment date (2026-10-20). |
| Caffeinated Capital | [57379-15](https://pitchbook.com/profiles/investor/57379-15) | Filled blank most recent investment date (2026-09-30). |
| Canaan Partners | [11135-71](https://pitchbook.com/profiles/investor/11135-71) | Filled blank most recent investment date (2026-10-30). |
| CDP Venture Capital | [123355-81](https://pitchbook.com/profiles/investor/123355-81) | Filled blank most recent investment date (2026-10-22). |
| Cherry Ventures | [100624-51](https://pitchbook.com/profiles/investor/100624-51) | Filled blank most recent investment date (2026-09-23). |
| Conviction Partners | [510108-40](https://pitchbook.com/profiles/investor/510108-40) | Filled blank most recent investment date (2026-10-29). |
| Collaborative Fund | [51595-21](https://pitchbook.com/profiles/investor/51595-21) | Skipped: preview reports 2027-03-31, a future date relative to this batch; no write made. |

### Latest startup tranche (8 exact-domain matches)


| Cashea | [512677-99](https://pitchbook.com/profiles/company/512677-99) | Exact cashea.app match; added description, 2022 founding year, 776 employees, Caracas/Miranda/Venezuela HQ, FinTech classification, and profile provenance. Existing $100M total raised retained. |
| Fern | [519134-14](https://pitchbook.com/profiles/company/519134-14) | Exact buildwithfern.com match; added description, 2023 founding year, 25 employees, Brooklyn/New York/US HQ, software-development/SaaS/AI classification, and profile provenance. PitchBook reports acquisition; no M&A was treated as a funding round. |
| Harmonic | [608847-76](https://pitchbook.com/profiles/company/608847-76) | Exact harmonic.fun match; added description, 2023 founding year, 49 employees, Palo Alto/California/US HQ, AI/SaaS classification, and profile provenance. |
| Harmony | [1078218-01](https://pitchbook.com/profiles/company/1078218-01) | Exact harmony.io match; added description, 2025 founding year, 68 employees, New York/US HQ, AI/enterprise-software classification, and profile provenance. Existing $34M total raised retained. |
| Hebbrix | [1372150-81](https://pitchbook.com/profiles/company/1372150-81) | Exact hebbrix.com match; added description, Boston/Massachusetts/US HQ, software-development/productivity/database industries, AI/SaaS verticals, and profile provenance. Preview shows no founding year or headcount. |
| Interloom | [590649-76](https://pitchbook.com/profiles/company/590649-76) | Exact interloom.com match; added description, 2024 founding year, 19 employees, Munich/Germany HQ, workflow-automation/AI/SaaS classifications, and profile provenance. |
| ISARA AI | [1366166-44](https://pitchbook.com/profiles/company/1366166-44) | Exact isara.ai match; added description, 2025 founding year, 3 employees, New York/US HQ, AI/FinTech verticals, and profile provenance. Existing $94M total raised retained. |
| Jenni AI | [496714-42](https://pitchbook.com/profiles/company/496714-42) | Exact jenni.ai match; added description, 2015 founding year, 14 employees, Wilmington/Delaware/US HQ, AI/SaaS/Big Data verticals, and profile provenance. PitchBook shows a later acquisition and a Jan 2026 financing; no acquisition was treated as funding. |
| Codex, HeadshotPro, InterviewCoder | — | Exact-domain PitchBook Playwright searches did not produce a confident matching preview; no fields updated. |

## Rate limit / access status

## Firm date continuation (20 guarded updates)

Filled blank `most_recent_investment_date` values from the exact PitchBook profile previews. Each update was guarded by row ID, active status, and the date still being blank, then returned and checked:

| Firm / investor | PitchBook profile | Date |
| --- | --- | --- |
| OrbiMed | [11263-51](https://pitchbook.com/profiles/investor/11263-51) | 2026-10-29 |
| Summit Partners | [10121-86](https://pitchbook.com/profiles/investor/10121-86) | 2026-10-22 |
| TCV | [10271-98](https://pitchbook.com/profiles/investor/10271-98) | 2026-10-23 |
| Threshold Ventures | [267929-02](https://pitchbook.com/profiles/investor/267929-02) | 2026-10-27 |
| Thrive Capital | [51625-90](https://pitchbook.com/profiles/investor/51625-90) | 2026-10-15 |
| Tiger Global Management | [42873-94](https://pitchbook.com/profiles/investor/42873-94) | 2026-10-28 |
| Titan Capital | [66331-09](https://pitchbook.com/profiles/investor/66331-09) | 2026-10-26 |
| TQ Ventures | [232265-71](https://pitchbook.com/profiles/investor/232265-71) | 2026-09-29 |
| True Ventures | [11321-29](https://pitchbook.com/profiles/investor/11321-29) | 2026-10-15 |
| Uncork Capital | [48176-38](https://pitchbook.com/profiles/investor/48176-38) | 2026-10-22 |
| Union Square Ventures | [11323-45](https://pitchbook.com/profiles/investor/11323-45) | 2026-10-27 |
| Unusual Ventures | [227419-12](https://pitchbook.com/profiles/investor/227419-12) | 2026-10-01 |
| Upfront Ventures | [11201-59](https://pitchbook.com/profiles/investor/11201-59) | 2026-10-20 |
| Venrock | [11326-33](https://pitchbook.com/profiles/investor/11326-33) | 2026-10-13 |
| Vertex Ventures Southeast Asia & India | [149516-20](https://pitchbook.com/profiles/investor/149516-20) | 2026-10-14 |
| Vertex Ventures US | [114710-05](https://pitchbook.com/profiles/investor/114710-05) | 2026-09-30 |
| Vitalik Buterin (Individual) | [229091-59](https://pitchbook.com/profiles/investor/229091-59) | 2025-09-03 |
| WndrCo | [170084-35](https://pitchbook.com/profiles/investor/170084-35) | 2026-09-24 |
| XYZ Venture Capital | [178234-03](https://pitchbook.com/profiles/investor/178234-03) | 2026-10-20 |
| Z Venture Capital | [463972-69](https://pitchbook.com/profiles/investor/463972-69) | 2026-10-16 |

Six blank dates were retained: Collaborative Fund's preview reports a future date (2027-03-31); Headline, Pioneer Fund, Radical Ventures, and Ten Eleven Ventures have conflicting or challenge-page website fields; LocalGlobe's linked preview is under Phoenix Court and was not rechecked in this tranche.

- During the current firm-date continuation, PitchBook briefly returned Cloudflare "Performing security verification" pages for Eclipse, Greenoaks Capital, Left Lane Capital, and Pioneer Fund. After waiting 30 seconds, challenged previews loaded normally; no challenge was solved or bypassed, and reads resumed. Pioneer Fund was read but skipped because the VEKTA row uses the unrelated cloudflare.com domain. The latest challenged URL loaded normally; reads resumed through Redpoint Ventures.
- After Redpoint Ventures, the connected CUA browser reported "Debugger unattached" for the existing PitchBook tab, and the Playwright MCP browser said the browser was already in use; remaining previews were not read in this continuation.
- PitchBook search pages sometimes returned a result count without profile cards. Google and Bing site-search attempts for Vertex Ventures returned challenge pages; no challenge was solved or bypassed. DuckDuckGo Playwright search later found Vertex Ventures US and Atomico previews.
- At the start of this continuation the PitchBook search URL returned news results rather than company/investor cards. Direct profile previews for Stakin and Serval loaded normally in Playwright, so those records were completed. No CAPTCHA or security challenge was solved or bypassed.
- A Playwright search for the Rainfall Ventures person Ron Rofe returned a result count but no preview card, so no individual-person fields were written.
- PitchBook firm previews do not expose person profile links for Rainfall or Kearny; indexed person searches for Kyle Sullivan and Sriram Krishnan produced no PitchBook person previews. No person fields were written.
- Firm and investor-person backlogs remain open. This continuation began person-profile matching and enriched Noubar Afeyan; thousands of investor-person fields and additional company/firm records remain. The latest person enrichment added Arianna Simpson from an exact Andreessen Horowitz match.

## Next batch

Continue reconciling the remaining 27 CSV names without an exact-name VEKTA row and 13 exact-name CSV names still lacking a PitchBook URL. Then review the remaining startup-company and investor-person queues, including 157 startups without a PitchBook URL and 5,437 investor bios still missing. Keep ambiguous matches out of the database and fill fields from accessible PitchBook previews only.
