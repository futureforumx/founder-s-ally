import { IsOptional, IsString, IsNumber, IsBoolean, Min, Max } from "class-validator";
import { Transform } from "class-transformer";

export class ListFoundersDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  /** Filter by expertise tag (exact match in expertise array). */
  @IsOptional()
  @IsString()
  expertise?: string;

  /** Filter by YC batch slug (e.g. "W21"). */
  @IsOptional()
  @IsString()
  ycBatch?: string;

  /** Restrict to YC-backed founders only. */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  ycOnly?: boolean;

  /** Restrict to repeat founders (founder_org_count >= 2). */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  repeatFounder?: boolean;

  /** Restrict to solo founders. */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  soloFounder?: boolean;

  /** Restrict to co-founders. */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  coFounder?: boolean;

  /** Restrict to cross-company operators (3+ orgs). */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  crossCompany?: boolean;

  /** Filter by country code (e.g. "US"). */
  @IsOptional()
  @IsString()
  country?: string;

  /** Filter by primary domain / expertise category. */
  @IsOptional()
  @IsString()
  domain?: string;
}
