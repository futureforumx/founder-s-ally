import { Controller, Get, Param, Query } from "@nestjs/common";
import { NetworkService } from "./network.service";
import type {
  OperatorProfileDto,
  OrgProfileDto,
  BatchClusterDto,
  ExpertiseClusterDto,
  PaginatedResponse,
} from "@founder-intel/types";
import { ListFoundersDto } from "./dto/network-queries.dto";

@Controller("network")
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  /**
   * GET /network/founders
   * Paginated operator list with optional signal filters.
   *
   * Query params:
   *   page, limit, expertise, ycBatch, ycOnly, repeatFounder,
   *   soloFounder, coFounder, crossCompany, country, domain
   */
  @Get("founders")
  listFounders(
    @Query() dto: ListFoundersDto,
  ): Promise<PaginatedResponse<OperatorProfileDto>> {
    return this.networkService.listFounders(dto);
  }

  /**
   * GET /network/founders/repeat
   * List all repeat founders (founded 2+ companies).
   */
  @Get("founders/repeat")
  listRepeatFounders(
    @Query("limit") limit?: string,
  ): Promise<OperatorProfileDto[]> {
    return this.networkService.listRepeatFounders(limit ? parseInt(limit, 10) : 50);
  }

  /**
   * GET /network/founders/cross-company
   * List cross-company operators (active at 3+ orgs).
   */
  @Get("founders/cross-company")
  listCrossCompanyOperators(
    @Query("limit") limit?: string,
  ): Promise<OperatorProfileDto[]> {
    return this.networkService.listCrossCompanyOperators(limit ? parseInt(limit, 10) : 50);
  }

  /**
   * GET /network/founders/:id/profile
   * Full operator profile + signals for a single person.
   */
  @Get("founders/:id/profile")
  getOperatorProfile(@Param("id") id: string): Promise<OperatorProfileDto> {
    return this.networkService.getOperatorProfile(id);
  }

  /**
   * GET /network/batches
   * All YC batch clusters ordered by batch (most recent first).
   */
  @Get("batches")
  listBatchClusters(): Promise<BatchClusterDto[]> {
    return this.networkService.listBatchClusters();
  }

  /**
   * GET /network/batches/:batch
   * Cluster data for a specific YC batch (e.g. W21, S22).
   */
  @Get("batches/:batch")
  getBatchCluster(@Param("batch") batch: string): Promise<BatchClusterDto> {
    return this.networkService.getBatchCluster(batch);
  }

  /**
   * GET /network/expertise
   * All expertise clusters ordered by founder count.
   */
  @Get("expertise")
  listExpertiseClusters(): Promise<ExpertiseClusterDto[]> {
    return this.networkService.listExpertiseClusters();
  }

  /**
   * GET /network/expertise/:tag
   * Cluster data for a specific expertise tag (e.g. "engineering").
   */
  @Get("expertise/:tag")
  getExpertiseCluster(@Param("tag") tag: string): Promise<ExpertiseClusterDto> {
    return this.networkService.getExpertiseCluster(tag);
  }

  /**
   * GET /network/orgs/:id/profile
   * Full org profile + founder array + signals.
   */
  @Get("orgs/:id/profile")
  getOrgProfile(@Param("id") id: string): Promise<OrgProfileDto> {
    return this.networkService.getOrgProfile(id);
  }

  /**
   * GET /network/orgs/:id/founders
   * All founder/operator profiles connected to an org (any role type).
   */
  @Get("orgs/:id/founders")
  getOrgFounders(@Param("id") id: string): Promise<OperatorProfileDto[]> {
    return this.networkService.getOrgFounders(id);
  }
}
