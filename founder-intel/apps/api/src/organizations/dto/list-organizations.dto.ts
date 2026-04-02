import { IsOptional, IsString, IsBoolean, IsNumber, Min, Max } from "class-validator";
import { Transform } from "class-transformer";

export class ListOrganizationsDto {
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

  @IsOptional()
  @IsString()
  sortBy?: "canonicalName" | "createdAt" | "updatedAt" | "foundedYear" = "createdAt";

  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc" = "desc";

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  ycOnly?: boolean;

  @IsOptional()
  @IsString()
  ycBatch?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
