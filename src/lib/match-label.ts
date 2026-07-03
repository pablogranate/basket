// Splits a "Home vs Away" match label into its two team names, matching the
// splitMatchLabel logic in MatchSummaryCell exactly so server-resolved logo keys
// line up with the cache keys the client component computes for each crest.
export function splitMatchLabelTeams(matchLabel: string) {
  const [homeTeam, awayTeam] = matchLabel.split(/\s+vs\s+/i);

  return {
    homeTeam: homeTeam?.trim() || matchLabel,
    awayTeam: awayTeam?.trim() || matchLabel,
  };
}

// Convenience for building resolveTeamLogoMap input from a match label +
// competition (the pair MatchSummaryCell renders as two crests).
export function matchLabelLogoPairs(matchLabel: string, competition: string) {
  const { homeTeam, awayTeam } = splitMatchLabelTeams(matchLabel);

  return [
    { teamName: homeTeam, competition },
    { teamName: awayTeam, competition },
  ];
}
