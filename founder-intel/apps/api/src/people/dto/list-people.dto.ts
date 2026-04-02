import { IsOptional, IsString, IsNumber, Min, Max } from "class-validator";
import { Transform } from "class-transformer";

export class ListPeopleDto {
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
  sortBy?: "canonicalName" | "createdAt" | "updatedAt" = "createdAt";

  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc" = "desc";

  @IsOptional()
  @IsString()
  expertise?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  orgId?: string; // Filter by organization
}
