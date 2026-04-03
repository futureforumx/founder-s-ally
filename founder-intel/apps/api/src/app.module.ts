import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { IngestionModule } from "./ingestion/ingestion.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { PeopleModule } from "./people/people.module";
import { SearchModule } from "./search/search.module";
import { SourcesModule } from "./sources/sources.module";
import { HealthModule } from "./health/health.module";
import { DatabaseModule } from "./config/database.module";
import { NetworkModule } from "./network/network.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    DatabaseModule,
    IngestionModule,
    OrganizationsModule,
    PeopleModule,
    SearchModule,
    SourcesModule,
    HealthModule,
    NetworkModule,
  ],
})
export class AppModule {}
