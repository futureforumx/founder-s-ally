/**
 * text-signals.ts
 * ================
 * Scans free-text (descriptions, thesis pages, firm copy) for strong signals
 * used by the classification parsers. Pure functions — unit-testable.
 */

export interface TextSignals {
  mentions_seed: boolean;
  mentions_pre_seed: boolean;
  mentions_series_a: boolean;
  mentions_series_b_plus: boolean;
  mentions_growth: boolean;
  mentions_buyout: boolean;
  mentions_multi_stage: boolean;
  mentions_earliest_stages: boolean;
  mentions_cvc: boolean;
  mentions_solo_gp: boolean;
  mentions_syndicate: boolean;
  mentions_family_office: boolean;
  mentions_impact_primary: boolean;
  mentions_impact_integrated: boolean;
  mentions_impact_considered: boolean;
  lead_indicators: number;   // how strongly text suggests lead behavior
  followon_indicators: number;
}

const RX = {
  seed: /\b(pre[\s-]?seed|seed[\s-]?stage|seed[\s-]?round|seed[\s-]?investments?)\b/i,
  pre_seed: /\bpre[\s-]?seed\b/i,
  series_a: /\bseries[\s-]?a\b/i,
  series_b_plus: /\bseries[\s-]?[b-z]\b|\bgrowth[\s-]?round/i,
  growth: /\b(growth[\s-]?equity|growth[\s-]?stage|growth[\s-]?investments?|late[\s-]?stage|expansion[\s-]?stage)\b/i,
  buyout: /\b(buyout|control[\s-]?investments?|leveraged[\s-]?buyout|lbo|majority[\s-]?stake)\b/i,
  multi_stage: /\b(multi[\s-]?stage|seed[\s-]?through[\s-]?growth|across[\s-]?stages|any[\s-]?stage|stage[\s-]?agnostic)\b/i,
  earliest_stages: /\b(earliest[\s-]?stages?|first[\s-]?money[\s-]?in|day[\s-]?one|at[\s-]?formation|idea[\s-]?stage)\b/i,

  cvc: /\b(corporate[\s-]?venture|cvc|strategic[\s-]?investments?|backed[\s-]?by[\s-]?[A-Z][a-zA-Z]+|ventures?[\s-]?arm)\b/i,
  solo_gp: /\b(solo[\s-]?gp|solo[\s-]?capitalist|single[\s-]?gp|one[\s-]?person[\s-]?fund)\b/i,
  syndicate: /\b(syndicate|rolling[\s-]?fund|investor[\s-]?collective)\b/i,
  family_office: /\b(family[\s-]?office|family[\s-]?capital|single[\s-]?family[\s-]?office)\b/i,

  impact_primary: /\b(impact[\s-]?first|mission[\s-]?driven|double[\s-]?bottom[\s-]?line|triple[\s-]?bottom[\s-]?line|measurable[\s-]?impact|impact[\s-]?measurement)\b/i,
  impact_integrated: /\b(esg[\s-]?integrated|sustainability[\s-]?focused|responsible[\s-]?investing|climate[\s-]?tech|climate[\s-]?capital)\b/i,
  impact_considered: /\b(esg|sustainability|responsible)\b/i,

  lead: /\b(lead[\s-]?investor|lead[\s-]?checks?|lead[\s-]?rounds?|we[\s-]?lead)\b/i,
  co_lead: /\b(co[\s-]?lead|co[\s-]?leading)\b/i,
  follow_on: /\b(follow[\s-]?on|follow[\s-]?check|co[\s-]?investor|participate[\s-]?in[\s-]?rounds?)\b/i,
};

export function parseTextSignals(text: string): TextSignals {
  const t = text || "";
  return {
    mentions_seed:            RX.seed.test(t),
    mentions_pre_seed:        RX.pre_seed.test(t),
    mentions_series_a:        RX.series_a.test(t),
    mentions_series_b_plus:   RX.series_b_plus.test(t),
    mentions_growth:          RX.growth.test(t),
    mentions_buyout:          RX.buyout.test(t),
    mentions_multi_stage:     RX.multi_stage.test(t),
    mentions_earliest_stages: RX.earliest_stages.test(t),
    mentions_cvc:             RX.cvc.test(t),
    mentions_solo_gp:         RX.solo_gp.test(t),
    mentions_syndicate:       RX.syndicate.test(t),
    mentions_family_office:   RX.family_office.test(t),
    mentions_impact_primary:  RX.impact_primary.test(t),
    mentions_impact_integrated: RX.impact_integrated.test(t),
    mentions_impact_considered: RX.impact_considered.test(t),
    lead_indicators:      (RX.lead.test(t) ? 1 : 0) + (RX.co_lead.test(t) ? 0.5 : 0),
    followon_indicators:  RX.follow_on.test(t) ? 1 : 0,
  };
}
