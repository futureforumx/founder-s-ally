
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.OrganizationScalarFieldEnum = {
  id: 'id',
  canonicalName: 'canonicalName',
  dedupeKey: 'dedupeKey',
  domain: 'domain',
  website: 'website',
  linkedinUrl: 'linkedinUrl',
  description: 'description',
  logoUrl: 'logoUrl',
  industry: 'industry',
  location: 'location',
  city: 'city',
  state: 'state',
  country: 'country',
  foundedYear: 'foundedYear',
  employeeCount: 'employeeCount',
  status: 'status',
  stageProxy: 'stageProxy',
  tags: 'tags',
  isYcBacked: 'isYcBacked',
  ycBatch: 'ycBatch',
  ycId: 'ycId',
  ycRawJson: 'ycRawJson',
  sourceIds: 'sourceIds',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PersonScalarFieldEnum = {
  id: 'id',
  canonicalName: 'canonicalName',
  dedupeKey: 'dedupeKey',
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  linkedinUrl: 'linkedinUrl',
  twitterUrl: 'twitterUrl',
  githubUrl: 'githubUrl',
  avatarUrl: 'avatarUrl',
  bio: 'bio',
  location: 'location',
  city: 'city',
  country: 'country',
  expertise: 'expertise',
  ycId: 'ycId',
  sourceIds: 'sourceIds',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  personId: 'personId',
  organizationId: 'organizationId',
  title: 'title',
  roleType: 'roleType',
  functionType: 'functionType',
  isCurrent: 'isCurrent',
  startDate: 'startDate',
  endDate: 'endDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SourceRecordScalarFieldEnum = {
  id: 'id',
  sourceAdapter: 'sourceAdapter',
  sourceUrl: 'sourceUrl',
  sourceId: 'sourceId',
  rawPayload: 'rawPayload',
  entityType: 'entityType',
  fetchedAt: 'fetchedAt',
  normalizedAt: 'normalizedAt',
  organizationId: 'organizationId',
  personId: 'personId'
};

exports.Prisma.IngestionJobScalarFieldEnum = {
  id: 'id',
  sourceAdapter: 'sourceAdapter',
  status: 'status',
  triggeredBy: 'triggeredBy',
  error: 'error',
  stats: 'stats',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.YcCompanyScalarFieldEnum = {
  id: 'id',
  ycId: 'ycId',
  slug: 'slug',
  name: 'name',
  batch: 'batch',
  status: 'status',
  website: 'website',
  description: 'description',
  longDescription: 'longDescription',
  teamSize: 'teamSize',
  allLocations: 'allLocations',
  industries: 'industries',
  subverticals: 'subverticals',
  tags: 'tags',
  badges: 'badges',
  foundersRaw: 'foundersRaw',
  rawJson: 'rawJson',
  organizationId: 'organizationId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.YcPersonScalarFieldEnum = {
  id: 'id',
  ycId: 'ycId',
  name: 'name',
  role: 'role',
  linkedinUrl: 'linkedinUrl',
  twitterUrl: 'twitterUrl',
  avatarUrl: 'avatarUrl',
  bio: 'bio',
  ycCompanyId: 'ycCompanyId',
  personId: 'personId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MatchDecisionScalarFieldEnum = {
  id: 'id',
  entityType: 'entityType',
  candidateIds: 'candidateIds',
  selectedId: 'selectedId',
  matchRuleUsed: 'matchRuleUsed',
  confidenceScore: 'confidenceScore',
  decisionType: 'decisionType',
  resolverVersion: 'resolverVersion',
  metadata: 'metadata',
  organizationId: 'organizationId',
  personId: 'personId',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  Organization: 'Organization',
  Person: 'Person',
  Role: 'Role',
  SourceRecord: 'SourceRecord',
  IngestionJob: 'IngestionJob',
  YcCompany: 'YcCompany',
  YcPerson: 'YcPerson',
  MatchDecision: 'MatchDecision'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
