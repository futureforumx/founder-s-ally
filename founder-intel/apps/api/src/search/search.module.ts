import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PeopleModule } from "../people/people.module";

@Module({
  imports: [OrganizationsModule, PeopleModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
