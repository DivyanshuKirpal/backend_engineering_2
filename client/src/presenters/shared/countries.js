// Countries for the identity check: the inhabited ISO 3166-1 codes, named
// in English through Intl (countryName, as on the admin pages) and sorted by
// name. The demo world is in India, as the Verification board draws it.

import { countryName } from '../formatters/status.format.js';

const CODES = (
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK '
  + 'FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS '
  + 'IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK '
  + 'ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL '
  + 'PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC '
  + 'TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

export const DEFAULT_COUNTRY = 'IN';

let options = null;

/** [{ value: 'IN', label: 'India' }, ...], by name. */
export function countryOptions() {
  options ??= CODES.map((code) => ({ value: code, label: countryName(code) })).sort((a, b) => a.label.localeCompare(b.label));
  return options;
}
