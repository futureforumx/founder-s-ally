import { IsString, IsOptional, IsBoolean, IsNumber, Min, Max } from "class-validator";

export class RunIngestionDto {
  @IsString()
  source!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxPages?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
