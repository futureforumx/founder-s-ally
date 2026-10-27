-- Company investor lookup checks firm_investors.portfolio_companies with @>.
-- Without a GIN index that is a full scan of every person and exceeds the
-- API statement timeout when the table is not already cached.

create index if not exists firm_investors_portfolio_companies_gin
  on public.firm_investors
  using gin (portfolio_companies)
  where deleted_at is null;
