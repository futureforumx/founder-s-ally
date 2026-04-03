import { Module } from "@nestjs/common";
import { NetworkController } from "./network.controller";
import { NetworkService } from "./network.service";
import { DatabaseModule } from "../config/database.module";

@Module({
  imports: [DatabaseModule],
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
