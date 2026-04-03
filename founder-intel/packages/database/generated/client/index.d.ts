
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Organization
 * 
 */
export type Organization = $Result.DefaultSelection<Prisma.$OrganizationPayload>
/**
 * Model Person
 * 
 */
export type Person = $Result.DefaultSelection<Prisma.$PersonPayload>
/**
 * Model Role
 * 
 */
export type Role = $Result.DefaultSelection<Prisma.$RolePayload>
/**
 * Model SourceRecord
 * 
 */
export type SourceRecord = $Result.DefaultSelection<Prisma.$SourceRecordPayload>
/**
 * Model IngestionJob
 * 
 */
export type IngestionJob = $Result.DefaultSelection<Prisma.$IngestionJobPayload>
/**
 * Model YcCompany
 * 
 */
export type YcCompany = $Result.DefaultSelection<Prisma.$YcCompanyPayload>
/**
 * Model YcPerson
 * 
 */
export type YcPerson = $Result.DefaultSelection<Prisma.$YcPersonPayload>
/**
 * Model MatchDecision
 * 
 */
export type MatchDecision = $Result.DefaultSelection<Prisma.$MatchDecisionPayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Organizations
 * const organizations = await prisma.organization.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Organizations
   * const organizations = await prisma.organization.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.organization`: Exposes CRUD operations for the **Organization** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Organizations
    * const organizations = await prisma.organization.findMany()
    * ```
    */
  get organization(): Prisma.OrganizationDelegate<ExtArgs>;

  /**
   * `prisma.person`: Exposes CRUD operations for the **Person** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more People
    * const people = await prisma.person.findMany()
    * ```
    */
  get person(): Prisma.PersonDelegate<ExtArgs>;

  /**
   * `prisma.role`: Exposes CRUD operations for the **Role** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Roles
    * const roles = await prisma.role.findMany()
    * ```
    */
  get role(): Prisma.RoleDelegate<ExtArgs>;

  /**
   * `prisma.sourceRecord`: Exposes CRUD operations for the **SourceRecord** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SourceRecords
    * const sourceRecords = await prisma.sourceRecord.findMany()
    * ```
    */
  get sourceRecord(): Prisma.SourceRecordDelegate<ExtArgs>;

  /**
   * `prisma.ingestionJob`: Exposes CRUD operations for the **IngestionJob** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more IngestionJobs
    * const ingestionJobs = await prisma.ingestionJob.findMany()
    * ```
    */
  get ingestionJob(): Prisma.IngestionJobDelegate<ExtArgs>;

  /**
   * `prisma.ycCompany`: Exposes CRUD operations for the **YcCompany** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more YcCompanies
    * const ycCompanies = await prisma.ycCompany.findMany()
    * ```
    */
  get ycCompany(): Prisma.YcCompanyDelegate<ExtArgs>;

  /**
   * `prisma.ycPerson`: Exposes CRUD operations for the **YcPerson** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more YcPeople
    * const ycPeople = await prisma.ycPerson.findMany()
    * ```
    */
  get ycPerson(): Prisma.YcPersonDelegate<ExtArgs>;

  /**
   * `prisma.matchDecision`: Exposes CRUD operations for the **MatchDecision** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more MatchDecisions
    * const matchDecisions = await prisma.matchDecision.findMany()
    * ```
    */
  get matchDecision(): Prisma.MatchDecisionDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Organization: 'Organization',
    Person: 'Person',
    Role: 'Role',
    SourceRecord: 'SourceRecord',
    IngestionJob: 'IngestionJob',
    YcCompany: 'YcCompany',
    YcPerson: 'YcPerson',
    MatchDecision: 'MatchDecision'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "organization" | "person" | "role" | "sourceRecord" | "ingestionJob" | "ycCompany" | "ycPerson" | "matchDecision"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Organization: {
        payload: Prisma.$OrganizationPayload<ExtArgs>
        fields: Prisma.OrganizationFieldRefs
        operations: {
          findUnique: {
            args: Prisma.OrganizationFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.OrganizationFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          findFirst: {
            args: Prisma.OrganizationFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.OrganizationFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          findMany: {
            args: Prisma.OrganizationFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>[]
          }
          create: {
            args: Prisma.OrganizationCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          createMany: {
            args: Prisma.OrganizationCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.OrganizationCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>[]
          }
          delete: {
            args: Prisma.OrganizationDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          update: {
            args: Prisma.OrganizationUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          deleteMany: {
            args: Prisma.OrganizationDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.OrganizationUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.OrganizationUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          aggregate: {
            args: Prisma.OrganizationAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateOrganization>
          }
          groupBy: {
            args: Prisma.OrganizationGroupByArgs<ExtArgs>
            result: $Utils.Optional<OrganizationGroupByOutputType>[]
          }
          count: {
            args: Prisma.OrganizationCountArgs<ExtArgs>
            result: $Utils.Optional<OrganizationCountAggregateOutputType> | number
          }
        }
      }
      Person: {
        payload: Prisma.$PersonPayload<ExtArgs>
        fields: Prisma.PersonFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PersonFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PersonFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload>
          }
          findFirst: {
            args: Prisma.PersonFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PersonFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload>
          }
          findMany: {
            args: Prisma.PersonFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload>[]
          }
          create: {
            args: Prisma.PersonCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload>
          }
          createMany: {
            args: Prisma.PersonCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PersonCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload>[]
          }
          delete: {
            args: Prisma.PersonDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload>
          }
          update: {
            args: Prisma.PersonUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload>
          }
          deleteMany: {
            args: Prisma.PersonDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PersonUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PersonUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PersonPayload>
          }
          aggregate: {
            args: Prisma.PersonAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePerson>
          }
          groupBy: {
            args: Prisma.PersonGroupByArgs<ExtArgs>
            result: $Utils.Optional<PersonGroupByOutputType>[]
          }
          count: {
            args: Prisma.PersonCountArgs<ExtArgs>
            result: $Utils.Optional<PersonCountAggregateOutputType> | number
          }
        }
      }
      Role: {
        payload: Prisma.$RolePayload<ExtArgs>
        fields: Prisma.RoleFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RoleFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RoleFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          findFirst: {
            args: Prisma.RoleFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RoleFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          findMany: {
            args: Prisma.RoleFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>[]
          }
          create: {
            args: Prisma.RoleCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          createMany: {
            args: Prisma.RoleCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.RoleCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>[]
          }
          delete: {
            args: Prisma.RoleDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          update: {
            args: Prisma.RoleUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          deleteMany: {
            args: Prisma.RoleDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RoleUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.RoleUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          aggregate: {
            args: Prisma.RoleAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRole>
          }
          groupBy: {
            args: Prisma.RoleGroupByArgs<ExtArgs>
            result: $Utils.Optional<RoleGroupByOutputType>[]
          }
          count: {
            args: Prisma.RoleCountArgs<ExtArgs>
            result: $Utils.Optional<RoleCountAggregateOutputType> | number
          }
        }
      }
      SourceRecord: {
        payload: Prisma.$SourceRecordPayload<ExtArgs>
        fields: Prisma.SourceRecordFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SourceRecordFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SourceRecordFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload>
          }
          findFirst: {
            args: Prisma.SourceRecordFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SourceRecordFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload>
          }
          findMany: {
            args: Prisma.SourceRecordFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload>[]
          }
          create: {
            args: Prisma.SourceRecordCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload>
          }
          createMany: {
            args: Prisma.SourceRecordCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SourceRecordCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload>[]
          }
          delete: {
            args: Prisma.SourceRecordDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload>
          }
          update: {
            args: Prisma.SourceRecordUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload>
          }
          deleteMany: {
            args: Prisma.SourceRecordDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SourceRecordUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.SourceRecordUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SourceRecordPayload>
          }
          aggregate: {
            args: Prisma.SourceRecordAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSourceRecord>
          }
          groupBy: {
            args: Prisma.SourceRecordGroupByArgs<ExtArgs>
            result: $Utils.Optional<SourceRecordGroupByOutputType>[]
          }
          count: {
            args: Prisma.SourceRecordCountArgs<ExtArgs>
            result: $Utils.Optional<SourceRecordCountAggregateOutputType> | number
          }
        }
      }
      IngestionJob: {
        payload: Prisma.$IngestionJobPayload<ExtArgs>
        fields: Prisma.IngestionJobFieldRefs
        operations: {
          findUnique: {
            args: Prisma.IngestionJobFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.IngestionJobFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload>
          }
          findFirst: {
            args: Prisma.IngestionJobFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.IngestionJobFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload>
          }
          findMany: {
            args: Prisma.IngestionJobFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload>[]
          }
          create: {
            args: Prisma.IngestionJobCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload>
          }
          createMany: {
            args: Prisma.IngestionJobCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.IngestionJobCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload>[]
          }
          delete: {
            args: Prisma.IngestionJobDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload>
          }
          update: {
            args: Prisma.IngestionJobUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload>
          }
          deleteMany: {
            args: Prisma.IngestionJobDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.IngestionJobUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.IngestionJobUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$IngestionJobPayload>
          }
          aggregate: {
            args: Prisma.IngestionJobAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateIngestionJob>
          }
          groupBy: {
            args: Prisma.IngestionJobGroupByArgs<ExtArgs>
            result: $Utils.Optional<IngestionJobGroupByOutputType>[]
          }
          count: {
            args: Prisma.IngestionJobCountArgs<ExtArgs>
            result: $Utils.Optional<IngestionJobCountAggregateOutputType> | number
          }
        }
      }
      YcCompany: {
        payload: Prisma.$YcCompanyPayload<ExtArgs>
        fields: Prisma.YcCompanyFieldRefs
        operations: {
          findUnique: {
            args: Prisma.YcCompanyFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.YcCompanyFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload>
          }
          findFirst: {
            args: Prisma.YcCompanyFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.YcCompanyFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload>
          }
          findMany: {
            args: Prisma.YcCompanyFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload>[]
          }
          create: {
            args: Prisma.YcCompanyCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload>
          }
          createMany: {
            args: Prisma.YcCompanyCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.YcCompanyCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload>[]
          }
          delete: {
            args: Prisma.YcCompanyDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload>
          }
          update: {
            args: Prisma.YcCompanyUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload>
          }
          deleteMany: {
            args: Prisma.YcCompanyDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.YcCompanyUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.YcCompanyUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcCompanyPayload>
          }
          aggregate: {
            args: Prisma.YcCompanyAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateYcCompany>
          }
          groupBy: {
            args: Prisma.YcCompanyGroupByArgs<ExtArgs>
            result: $Utils.Optional<YcCompanyGroupByOutputType>[]
          }
          count: {
            args: Prisma.YcCompanyCountArgs<ExtArgs>
            result: $Utils.Optional<YcCompanyCountAggregateOutputType> | number
          }
        }
      }
      YcPerson: {
        payload: Prisma.$YcPersonPayload<ExtArgs>
        fields: Prisma.YcPersonFieldRefs
        operations: {
          findUnique: {
            args: Prisma.YcPersonFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.YcPersonFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload>
          }
          findFirst: {
            args: Prisma.YcPersonFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.YcPersonFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload>
          }
          findMany: {
            args: Prisma.YcPersonFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload>[]
          }
          create: {
            args: Prisma.YcPersonCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload>
          }
          createMany: {
            args: Prisma.YcPersonCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.YcPersonCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload>[]
          }
          delete: {
            args: Prisma.YcPersonDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload>
          }
          update: {
            args: Prisma.YcPersonUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload>
          }
          deleteMany: {
            args: Prisma.YcPersonDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.YcPersonUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.YcPersonUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$YcPersonPayload>
          }
          aggregate: {
            args: Prisma.YcPersonAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateYcPerson>
          }
          groupBy: {
            args: Prisma.YcPersonGroupByArgs<ExtArgs>
            result: $Utils.Optional<YcPersonGroupByOutputType>[]
          }
          count: {
            args: Prisma.YcPersonCountArgs<ExtArgs>
            result: $Utils.Optional<YcPersonCountAggregateOutputType> | number
          }
        }
      }
      MatchDecision: {
        payload: Prisma.$MatchDecisionPayload<ExtArgs>
        fields: Prisma.MatchDecisionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.MatchDecisionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.MatchDecisionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload>
          }
          findFirst: {
            args: Prisma.MatchDecisionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.MatchDecisionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload>
          }
          findMany: {
            args: Prisma.MatchDecisionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload>[]
          }
          create: {
            args: Prisma.MatchDecisionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload>
          }
          createMany: {
            args: Prisma.MatchDecisionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.MatchDecisionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload>[]
          }
          delete: {
            args: Prisma.MatchDecisionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload>
          }
          update: {
            args: Prisma.MatchDecisionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload>
          }
          deleteMany: {
            args: Prisma.MatchDecisionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.MatchDecisionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.MatchDecisionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchDecisionPayload>
          }
          aggregate: {
            args: Prisma.MatchDecisionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateMatchDecision>
          }
          groupBy: {
            args: Prisma.MatchDecisionGroupByArgs<ExtArgs>
            result: $Utils.Optional<MatchDecisionGroupByOutputType>[]
          }
          count: {
            args: Prisma.MatchDecisionCountArgs<ExtArgs>
            result: $Utils.Optional<MatchDecisionCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type OrganizationCountOutputType
   */

  export type OrganizationCountOutputType = {
    roles: number
    sourceRecords: number
    matchDecisions: number
  }

  export type OrganizationCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roles?: boolean | OrganizationCountOutputTypeCountRolesArgs
    sourceRecords?: boolean | OrganizationCountOutputTypeCountSourceRecordsArgs
    matchDecisions?: boolean | OrganizationCountOutputTypeCountMatchDecisionsArgs
  }

  // Custom InputTypes
  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationCountOutputType
     */
    select?: OrganizationCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountRolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RoleWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountSourceRecordsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SourceRecordWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountMatchDecisionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchDecisionWhereInput
  }


  /**
   * Count Type PersonCountOutputType
   */

  export type PersonCountOutputType = {
    roles: number
    sourceRecords: number
    matchDecisions: number
  }

  export type PersonCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roles?: boolean | PersonCountOutputTypeCountRolesArgs
    sourceRecords?: boolean | PersonCountOutputTypeCountSourceRecordsArgs
    matchDecisions?: boolean | PersonCountOutputTypeCountMatchDecisionsArgs
  }

  // Custom InputTypes
  /**
   * PersonCountOutputType without action
   */
  export type PersonCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PersonCountOutputType
     */
    select?: PersonCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * PersonCountOutputType without action
   */
  export type PersonCountOutputTypeCountRolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RoleWhereInput
  }

  /**
   * PersonCountOutputType without action
   */
  export type PersonCountOutputTypeCountSourceRecordsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SourceRecordWhereInput
  }

  /**
   * PersonCountOutputType without action
   */
  export type PersonCountOutputTypeCountMatchDecisionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchDecisionWhereInput
  }


  /**
   * Count Type YcCompanyCountOutputType
   */

  export type YcCompanyCountOutputType = {
    ycPersons: number
  }

  export type YcCompanyCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ycPersons?: boolean | YcCompanyCountOutputTypeCountYcPersonsArgs
  }

  // Custom InputTypes
  /**
   * YcCompanyCountOutputType without action
   */
  export type YcCompanyCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompanyCountOutputType
     */
    select?: YcCompanyCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * YcCompanyCountOutputType without action
   */
  export type YcCompanyCountOutputTypeCountYcPersonsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: YcPersonWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Organization
   */

  export type AggregateOrganization = {
    _count: OrganizationCountAggregateOutputType | null
    _avg: OrganizationAvgAggregateOutputType | null
    _sum: OrganizationSumAggregateOutputType | null
    _min: OrganizationMinAggregateOutputType | null
    _max: OrganizationMaxAggregateOutputType | null
  }

  export type OrganizationAvgAggregateOutputType = {
    foundedYear: number | null
    employeeCount: number | null
  }

  export type OrganizationSumAggregateOutputType = {
    foundedYear: number | null
    employeeCount: number | null
  }

  export type OrganizationMinAggregateOutputType = {
    id: string | null
    canonicalName: string | null
    dedupeKey: string | null
    domain: string | null
    website: string | null
    linkedinUrl: string | null
    description: string | null
    logoUrl: string | null
    industry: string | null
    location: string | null
    city: string | null
    state: string | null
    country: string | null
    foundedYear: number | null
    employeeCount: number | null
    status: string | null
    stageProxy: string | null
    isYcBacked: boolean | null
    ycBatch: string | null
    ycId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type OrganizationMaxAggregateOutputType = {
    id: string | null
    canonicalName: string | null
    dedupeKey: string | null
    domain: string | null
    website: string | null
    linkedinUrl: string | null
    description: string | null
    logoUrl: string | null
    industry: string | null
    location: string | null
    city: string | null
    state: string | null
    country: string | null
    foundedYear: number | null
    employeeCount: number | null
    status: string | null
    stageProxy: string | null
    isYcBacked: boolean | null
    ycBatch: string | null
    ycId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type OrganizationCountAggregateOutputType = {
    id: number
    canonicalName: number
    dedupeKey: number
    domain: number
    website: number
    linkedinUrl: number
    description: number
    logoUrl: number
    industry: number
    location: number
    city: number
    state: number
    country: number
    foundedYear: number
    employeeCount: number
    status: number
    stageProxy: number
    tags: number
    isYcBacked: number
    ycBatch: number
    ycId: number
    ycRawJson: number
    sourceIds: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type OrganizationAvgAggregateInputType = {
    foundedYear?: true
    employeeCount?: true
  }

  export type OrganizationSumAggregateInputType = {
    foundedYear?: true
    employeeCount?: true
  }

  export type OrganizationMinAggregateInputType = {
    id?: true
    canonicalName?: true
    dedupeKey?: true
    domain?: true
    website?: true
    linkedinUrl?: true
    description?: true
    logoUrl?: true
    industry?: true
    location?: true
    city?: true
    state?: true
    country?: true
    foundedYear?: true
    employeeCount?: true
    status?: true
    stageProxy?: true
    isYcBacked?: true
    ycBatch?: true
    ycId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type OrganizationMaxAggregateInputType = {
    id?: true
    canonicalName?: true
    dedupeKey?: true
    domain?: true
    website?: true
    linkedinUrl?: true
    description?: true
    logoUrl?: true
    industry?: true
    location?: true
    city?: true
    state?: true
    country?: true
    foundedYear?: true
    employeeCount?: true
    status?: true
    stageProxy?: true
    isYcBacked?: true
    ycBatch?: true
    ycId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type OrganizationCountAggregateInputType = {
    id?: true
    canonicalName?: true
    dedupeKey?: true
    domain?: true
    website?: true
    linkedinUrl?: true
    description?: true
    logoUrl?: true
    industry?: true
    location?: true
    city?: true
    state?: true
    country?: true
    foundedYear?: true
    employeeCount?: true
    status?: true
    stageProxy?: true
    tags?: true
    isYcBacked?: true
    ycBatch?: true
    ycId?: true
    ycRawJson?: true
    sourceIds?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type OrganizationAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Organization to aggregate.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Organizations
    **/
    _count?: true | OrganizationCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: OrganizationAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: OrganizationSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: OrganizationMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: OrganizationMaxAggregateInputType
  }

  export type GetOrganizationAggregateType<T extends OrganizationAggregateArgs> = {
        [P in keyof T & keyof AggregateOrganization]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOrganization[P]>
      : GetScalarType<T[P], AggregateOrganization[P]>
  }




  export type OrganizationGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OrganizationWhereInput
    orderBy?: OrganizationOrderByWithAggregationInput | OrganizationOrderByWithAggregationInput[]
    by: OrganizationScalarFieldEnum[] | OrganizationScalarFieldEnum
    having?: OrganizationScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: OrganizationCountAggregateInputType | true
    _avg?: OrganizationAvgAggregateInputType
    _sum?: OrganizationSumAggregateInputType
    _min?: OrganizationMinAggregateInputType
    _max?: OrganizationMaxAggregateInputType
  }

  export type OrganizationGroupByOutputType = {
    id: string
    canonicalName: string
    dedupeKey: string
    domain: string | null
    website: string | null
    linkedinUrl: string | null
    description: string | null
    logoUrl: string | null
    industry: string | null
    location: string | null
    city: string | null
    state: string | null
    country: string | null
    foundedYear: number | null
    employeeCount: number | null
    status: string | null
    stageProxy: string | null
    tags: string[]
    isYcBacked: boolean
    ycBatch: string | null
    ycId: string | null
    ycRawJson: JsonValue | null
    sourceIds: string[]
    createdAt: Date
    updatedAt: Date
    _count: OrganizationCountAggregateOutputType | null
    _avg: OrganizationAvgAggregateOutputType | null
    _sum: OrganizationSumAggregateOutputType | null
    _min: OrganizationMinAggregateOutputType | null
    _max: OrganizationMaxAggregateOutputType | null
  }

  type GetOrganizationGroupByPayload<T extends OrganizationGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<OrganizationGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof OrganizationGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OrganizationGroupByOutputType[P]>
            : GetScalarType<T[P], OrganizationGroupByOutputType[P]>
        }
      >
    >


  export type OrganizationSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    canonicalName?: boolean
    dedupeKey?: boolean
    domain?: boolean
    website?: boolean
    linkedinUrl?: boolean
    description?: boolean
    logoUrl?: boolean
    industry?: boolean
    location?: boolean
    city?: boolean
    state?: boolean
    country?: boolean
    foundedYear?: boolean
    employeeCount?: boolean
    status?: boolean
    stageProxy?: boolean
    tags?: boolean
    isYcBacked?: boolean
    ycBatch?: boolean
    ycId?: boolean
    ycRawJson?: boolean
    sourceIds?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    roles?: boolean | Organization$rolesArgs<ExtArgs>
    sourceRecords?: boolean | Organization$sourceRecordsArgs<ExtArgs>
    matchDecisions?: boolean | Organization$matchDecisionsArgs<ExtArgs>
    ycCompany?: boolean | Organization$ycCompanyArgs<ExtArgs>
    _count?: boolean | OrganizationCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["organization"]>

  export type OrganizationSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    canonicalName?: boolean
    dedupeKey?: boolean
    domain?: boolean
    website?: boolean
    linkedinUrl?: boolean
    description?: boolean
    logoUrl?: boolean
    industry?: boolean
    location?: boolean
    city?: boolean
    state?: boolean
    country?: boolean
    foundedYear?: boolean
    employeeCount?: boolean
    status?: boolean
    stageProxy?: boolean
    tags?: boolean
    isYcBacked?: boolean
    ycBatch?: boolean
    ycId?: boolean
    ycRawJson?: boolean
    sourceIds?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["organization"]>

  export type OrganizationSelectScalar = {
    id?: boolean
    canonicalName?: boolean
    dedupeKey?: boolean
    domain?: boolean
    website?: boolean
    linkedinUrl?: boolean
    description?: boolean
    logoUrl?: boolean
    industry?: boolean
    location?: boolean
    city?: boolean
    state?: boolean
    country?: boolean
    foundedYear?: boolean
    employeeCount?: boolean
    status?: boolean
    stageProxy?: boolean
    tags?: boolean
    isYcBacked?: boolean
    ycBatch?: boolean
    ycId?: boolean
    ycRawJson?: boolean
    sourceIds?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type OrganizationInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roles?: boolean | Organization$rolesArgs<ExtArgs>
    sourceRecords?: boolean | Organization$sourceRecordsArgs<ExtArgs>
    matchDecisions?: boolean | Organization$matchDecisionsArgs<ExtArgs>
    ycCompany?: boolean | Organization$ycCompanyArgs<ExtArgs>
    _count?: boolean | OrganizationCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type OrganizationIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $OrganizationPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Organization"
    objects: {
      roles: Prisma.$RolePayload<ExtArgs>[]
      sourceRecords: Prisma.$SourceRecordPayload<ExtArgs>[]
      matchDecisions: Prisma.$MatchDecisionPayload<ExtArgs>[]
      ycCompany: Prisma.$YcCompanyPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      canonicalName: string
      dedupeKey: string
      domain: string | null
      website: string | null
      linkedinUrl: string | null
      description: string | null
      logoUrl: string | null
      industry: string | null
      location: string | null
      city: string | null
      state: string | null
      country: string | null
      foundedYear: number | null
      employeeCount: number | null
      status: string | null
      stageProxy: string | null
      tags: string[]
      isYcBacked: boolean
      ycBatch: string | null
      ycId: string | null
      ycRawJson: Prisma.JsonValue | null
      sourceIds: string[]
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["organization"]>
    composites: {}
  }

  type OrganizationGetPayload<S extends boolean | null | undefined | OrganizationDefaultArgs> = $Result.GetResult<Prisma.$OrganizationPayload, S>

  type OrganizationCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<OrganizationFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: OrganizationCountAggregateInputType | true
    }

  export interface OrganizationDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Organization'], meta: { name: 'Organization' } }
    /**
     * Find zero or one Organization that matches the filter.
     * @param {OrganizationFindUniqueArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OrganizationFindUniqueArgs>(args: SelectSubset<T, OrganizationFindUniqueArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Organization that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {OrganizationFindUniqueOrThrowArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OrganizationFindUniqueOrThrowArgs>(args: SelectSubset<T, OrganizationFindUniqueOrThrowArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Organization that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindFirstArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OrganizationFindFirstArgs>(args?: SelectSubset<T, OrganizationFindFirstArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Organization that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindFirstOrThrowArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OrganizationFindFirstOrThrowArgs>(args?: SelectSubset<T, OrganizationFindFirstOrThrowArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Organizations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Organizations
     * const organizations = await prisma.organization.findMany()
     * 
     * // Get first 10 Organizations
     * const organizations = await prisma.organization.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const organizationWithIdOnly = await prisma.organization.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends OrganizationFindManyArgs>(args?: SelectSubset<T, OrganizationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Organization.
     * @param {OrganizationCreateArgs} args - Arguments to create a Organization.
     * @example
     * // Create one Organization
     * const Organization = await prisma.organization.create({
     *   data: {
     *     // ... data to create a Organization
     *   }
     * })
     * 
     */
    create<T extends OrganizationCreateArgs>(args: SelectSubset<T, OrganizationCreateArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Organizations.
     * @param {OrganizationCreateManyArgs} args - Arguments to create many Organizations.
     * @example
     * // Create many Organizations
     * const organization = await prisma.organization.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends OrganizationCreateManyArgs>(args?: SelectSubset<T, OrganizationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Organizations and returns the data saved in the database.
     * @param {OrganizationCreateManyAndReturnArgs} args - Arguments to create many Organizations.
     * @example
     * // Create many Organizations
     * const organization = await prisma.organization.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Organizations and only return the `id`
     * const organizationWithIdOnly = await prisma.organization.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends OrganizationCreateManyAndReturnArgs>(args?: SelectSubset<T, OrganizationCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Organization.
     * @param {OrganizationDeleteArgs} args - Arguments to delete one Organization.
     * @example
     * // Delete one Organization
     * const Organization = await prisma.organization.delete({
     *   where: {
     *     // ... filter to delete one Organization
     *   }
     * })
     * 
     */
    delete<T extends OrganizationDeleteArgs>(args: SelectSubset<T, OrganizationDeleteArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Organization.
     * @param {OrganizationUpdateArgs} args - Arguments to update one Organization.
     * @example
     * // Update one Organization
     * const organization = await prisma.organization.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends OrganizationUpdateArgs>(args: SelectSubset<T, OrganizationUpdateArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Organizations.
     * @param {OrganizationDeleteManyArgs} args - Arguments to filter Organizations to delete.
     * @example
     * // Delete a few Organizations
     * const { count } = await prisma.organization.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends OrganizationDeleteManyArgs>(args?: SelectSubset<T, OrganizationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Organizations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Organizations
     * const organization = await prisma.organization.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends OrganizationUpdateManyArgs>(args: SelectSubset<T, OrganizationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Organization.
     * @param {OrganizationUpsertArgs} args - Arguments to update or create a Organization.
     * @example
     * // Update or create a Organization
     * const organization = await prisma.organization.upsert({
     *   create: {
     *     // ... data to create a Organization
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Organization we want to update
     *   }
     * })
     */
    upsert<T extends OrganizationUpsertArgs>(args: SelectSubset<T, OrganizationUpsertArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Organizations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationCountArgs} args - Arguments to filter Organizations to count.
     * @example
     * // Count the number of Organizations
     * const count = await prisma.organization.count({
     *   where: {
     *     // ... the filter for the Organizations we want to count
     *   }
     * })
    **/
    count<T extends OrganizationCountArgs>(
      args?: Subset<T, OrganizationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], OrganizationCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Organization.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends OrganizationAggregateArgs>(args: Subset<T, OrganizationAggregateArgs>): Prisma.PrismaPromise<GetOrganizationAggregateType<T>>

    /**
     * Group by Organization.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends OrganizationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OrganizationGroupByArgs['orderBy'] }
        : { orderBy?: OrganizationGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, OrganizationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetOrganizationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Organization model
   */
  readonly fields: OrganizationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Organization.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OrganizationClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    roles<T extends Organization$rolesArgs<ExtArgs> = {}>(args?: Subset<T, Organization$rolesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findMany"> | Null>
    sourceRecords<T extends Organization$sourceRecordsArgs<ExtArgs> = {}>(args?: Subset<T, Organization$sourceRecordsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "findMany"> | Null>
    matchDecisions<T extends Organization$matchDecisionsArgs<ExtArgs> = {}>(args?: Subset<T, Organization$matchDecisionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "findMany"> | Null>
    ycCompany<T extends Organization$ycCompanyArgs<ExtArgs> = {}>(args?: Subset<T, Organization$ycCompanyArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Organization model
   */ 
  interface OrganizationFieldRefs {
    readonly id: FieldRef<"Organization", 'String'>
    readonly canonicalName: FieldRef<"Organization", 'String'>
    readonly dedupeKey: FieldRef<"Organization", 'String'>
    readonly domain: FieldRef<"Organization", 'String'>
    readonly website: FieldRef<"Organization", 'String'>
    readonly linkedinUrl: FieldRef<"Organization", 'String'>
    readonly description: FieldRef<"Organization", 'String'>
    readonly logoUrl: FieldRef<"Organization", 'String'>
    readonly industry: FieldRef<"Organization", 'String'>
    readonly location: FieldRef<"Organization", 'String'>
    readonly city: FieldRef<"Organization", 'String'>
    readonly state: FieldRef<"Organization", 'String'>
    readonly country: FieldRef<"Organization", 'String'>
    readonly foundedYear: FieldRef<"Organization", 'Int'>
    readonly employeeCount: FieldRef<"Organization", 'Int'>
    readonly status: FieldRef<"Organization", 'String'>
    readonly stageProxy: FieldRef<"Organization", 'String'>
    readonly tags: FieldRef<"Organization", 'String[]'>
    readonly isYcBacked: FieldRef<"Organization", 'Boolean'>
    readonly ycBatch: FieldRef<"Organization", 'String'>
    readonly ycId: FieldRef<"Organization", 'String'>
    readonly ycRawJson: FieldRef<"Organization", 'Json'>
    readonly sourceIds: FieldRef<"Organization", 'String[]'>
    readonly createdAt: FieldRef<"Organization", 'DateTime'>
    readonly updatedAt: FieldRef<"Organization", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Organization findUnique
   */
  export type OrganizationFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization findUniqueOrThrow
   */
  export type OrganizationFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization findFirst
   */
  export type OrganizationFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Organizations.
     */
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization findFirstOrThrow
   */
  export type OrganizationFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Organizations.
     */
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization findMany
   */
  export type OrganizationFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organizations to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization create
   */
  export type OrganizationCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The data needed to create a Organization.
     */
    data: XOR<OrganizationCreateInput, OrganizationUncheckedCreateInput>
  }

  /**
   * Organization createMany
   */
  export type OrganizationCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Organizations.
     */
    data: OrganizationCreateManyInput | OrganizationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Organization createManyAndReturn
   */
  export type OrganizationCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Organizations.
     */
    data: OrganizationCreateManyInput | OrganizationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Organization update
   */
  export type OrganizationUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The data needed to update a Organization.
     */
    data: XOR<OrganizationUpdateInput, OrganizationUncheckedUpdateInput>
    /**
     * Choose, which Organization to update.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization updateMany
   */
  export type OrganizationUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Organizations.
     */
    data: XOR<OrganizationUpdateManyMutationInput, OrganizationUncheckedUpdateManyInput>
    /**
     * Filter which Organizations to update
     */
    where?: OrganizationWhereInput
  }

  /**
   * Organization upsert
   */
  export type OrganizationUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The filter to search for the Organization to update in case it exists.
     */
    where: OrganizationWhereUniqueInput
    /**
     * In case the Organization found by the `where` argument doesn't exist, create a new Organization with this data.
     */
    create: XOR<OrganizationCreateInput, OrganizationUncheckedCreateInput>
    /**
     * In case the Organization was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OrganizationUpdateInput, OrganizationUncheckedUpdateInput>
  }

  /**
   * Organization delete
   */
  export type OrganizationDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter which Organization to delete.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization deleteMany
   */
  export type OrganizationDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Organizations to delete
     */
    where?: OrganizationWhereInput
  }

  /**
   * Organization.roles
   */
  export type Organization$rolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    where?: RoleWhereInput
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    cursor?: RoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Organization.sourceRecords
   */
  export type Organization$sourceRecordsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    where?: SourceRecordWhereInput
    orderBy?: SourceRecordOrderByWithRelationInput | SourceRecordOrderByWithRelationInput[]
    cursor?: SourceRecordWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SourceRecordScalarFieldEnum | SourceRecordScalarFieldEnum[]
  }

  /**
   * Organization.matchDecisions
   */
  export type Organization$matchDecisionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    where?: MatchDecisionWhereInput
    orderBy?: MatchDecisionOrderByWithRelationInput | MatchDecisionOrderByWithRelationInput[]
    cursor?: MatchDecisionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MatchDecisionScalarFieldEnum | MatchDecisionScalarFieldEnum[]
  }

  /**
   * Organization.ycCompany
   */
  export type Organization$ycCompanyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    where?: YcCompanyWhereInput
  }

  /**
   * Organization without action
   */
  export type OrganizationDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
  }


  /**
   * Model Person
   */

  export type AggregatePerson = {
    _count: PersonCountAggregateOutputType | null
    _min: PersonMinAggregateOutputType | null
    _max: PersonMaxAggregateOutputType | null
  }

  export type PersonMinAggregateOutputType = {
    id: string | null
    canonicalName: string | null
    dedupeKey: string | null
    firstName: string | null
    lastName: string | null
    email: string | null
    linkedinUrl: string | null
    twitterUrl: string | null
    githubUrl: string | null
    avatarUrl: string | null
    bio: string | null
    location: string | null
    city: string | null
    country: string | null
    ycId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PersonMaxAggregateOutputType = {
    id: string | null
    canonicalName: string | null
    dedupeKey: string | null
    firstName: string | null
    lastName: string | null
    email: string | null
    linkedinUrl: string | null
    twitterUrl: string | null
    githubUrl: string | null
    avatarUrl: string | null
    bio: string | null
    location: string | null
    city: string | null
    country: string | null
    ycId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PersonCountAggregateOutputType = {
    id: number
    canonicalName: number
    dedupeKey: number
    firstName: number
    lastName: number
    email: number
    linkedinUrl: number
    twitterUrl: number
    githubUrl: number
    avatarUrl: number
    bio: number
    location: number
    city: number
    country: number
    expertise: number
    ycId: number
    sourceIds: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type PersonMinAggregateInputType = {
    id?: true
    canonicalName?: true
    dedupeKey?: true
    firstName?: true
    lastName?: true
    email?: true
    linkedinUrl?: true
    twitterUrl?: true
    githubUrl?: true
    avatarUrl?: true
    bio?: true
    location?: true
    city?: true
    country?: true
    ycId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PersonMaxAggregateInputType = {
    id?: true
    canonicalName?: true
    dedupeKey?: true
    firstName?: true
    lastName?: true
    email?: true
    linkedinUrl?: true
    twitterUrl?: true
    githubUrl?: true
    avatarUrl?: true
    bio?: true
    location?: true
    city?: true
    country?: true
    ycId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PersonCountAggregateInputType = {
    id?: true
    canonicalName?: true
    dedupeKey?: true
    firstName?: true
    lastName?: true
    email?: true
    linkedinUrl?: true
    twitterUrl?: true
    githubUrl?: true
    avatarUrl?: true
    bio?: true
    location?: true
    city?: true
    country?: true
    expertise?: true
    ycId?: true
    sourceIds?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type PersonAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Person to aggregate.
     */
    where?: PersonWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of People to fetch.
     */
    orderBy?: PersonOrderByWithRelationInput | PersonOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PersonWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` People from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` People.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned People
    **/
    _count?: true | PersonCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PersonMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PersonMaxAggregateInputType
  }

  export type GetPersonAggregateType<T extends PersonAggregateArgs> = {
        [P in keyof T & keyof AggregatePerson]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePerson[P]>
      : GetScalarType<T[P], AggregatePerson[P]>
  }




  export type PersonGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PersonWhereInput
    orderBy?: PersonOrderByWithAggregationInput | PersonOrderByWithAggregationInput[]
    by: PersonScalarFieldEnum[] | PersonScalarFieldEnum
    having?: PersonScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PersonCountAggregateInputType | true
    _min?: PersonMinAggregateInputType
    _max?: PersonMaxAggregateInputType
  }

  export type PersonGroupByOutputType = {
    id: string
    canonicalName: string
    dedupeKey: string
    firstName: string | null
    lastName: string | null
    email: string | null
    linkedinUrl: string | null
    twitterUrl: string | null
    githubUrl: string | null
    avatarUrl: string | null
    bio: string | null
    location: string | null
    city: string | null
    country: string | null
    expertise: string[]
    ycId: string | null
    sourceIds: string[]
    createdAt: Date
    updatedAt: Date
    _count: PersonCountAggregateOutputType | null
    _min: PersonMinAggregateOutputType | null
    _max: PersonMaxAggregateOutputType | null
  }

  type GetPersonGroupByPayload<T extends PersonGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PersonGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PersonGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PersonGroupByOutputType[P]>
            : GetScalarType<T[P], PersonGroupByOutputType[P]>
        }
      >
    >


  export type PersonSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    canonicalName?: boolean
    dedupeKey?: boolean
    firstName?: boolean
    lastName?: boolean
    email?: boolean
    linkedinUrl?: boolean
    twitterUrl?: boolean
    githubUrl?: boolean
    avatarUrl?: boolean
    bio?: boolean
    location?: boolean
    city?: boolean
    country?: boolean
    expertise?: boolean
    ycId?: boolean
    sourceIds?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    roles?: boolean | Person$rolesArgs<ExtArgs>
    sourceRecords?: boolean | Person$sourceRecordsArgs<ExtArgs>
    matchDecisions?: boolean | Person$matchDecisionsArgs<ExtArgs>
    ycPerson?: boolean | Person$ycPersonArgs<ExtArgs>
    _count?: boolean | PersonCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["person"]>

  export type PersonSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    canonicalName?: boolean
    dedupeKey?: boolean
    firstName?: boolean
    lastName?: boolean
    email?: boolean
    linkedinUrl?: boolean
    twitterUrl?: boolean
    githubUrl?: boolean
    avatarUrl?: boolean
    bio?: boolean
    location?: boolean
    city?: boolean
    country?: boolean
    expertise?: boolean
    ycId?: boolean
    sourceIds?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["person"]>

  export type PersonSelectScalar = {
    id?: boolean
    canonicalName?: boolean
    dedupeKey?: boolean
    firstName?: boolean
    lastName?: boolean
    email?: boolean
    linkedinUrl?: boolean
    twitterUrl?: boolean
    githubUrl?: boolean
    avatarUrl?: boolean
    bio?: boolean
    location?: boolean
    city?: boolean
    country?: boolean
    expertise?: boolean
    ycId?: boolean
    sourceIds?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type PersonInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roles?: boolean | Person$rolesArgs<ExtArgs>
    sourceRecords?: boolean | Person$sourceRecordsArgs<ExtArgs>
    matchDecisions?: boolean | Person$matchDecisionsArgs<ExtArgs>
    ycPerson?: boolean | Person$ycPersonArgs<ExtArgs>
    _count?: boolean | PersonCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type PersonIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $PersonPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Person"
    objects: {
      roles: Prisma.$RolePayload<ExtArgs>[]
      sourceRecords: Prisma.$SourceRecordPayload<ExtArgs>[]
      matchDecisions: Prisma.$MatchDecisionPayload<ExtArgs>[]
      ycPerson: Prisma.$YcPersonPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      canonicalName: string
      dedupeKey: string
      firstName: string | null
      lastName: string | null
      email: string | null
      linkedinUrl: string | null
      twitterUrl: string | null
      githubUrl: string | null
      avatarUrl: string | null
      bio: string | null
      location: string | null
      city: string | null
      country: string | null
      expertise: string[]
      ycId: string | null
      sourceIds: string[]
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["person"]>
    composites: {}
  }

  type PersonGetPayload<S extends boolean | null | undefined | PersonDefaultArgs> = $Result.GetResult<Prisma.$PersonPayload, S>

  type PersonCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<PersonFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: PersonCountAggregateInputType | true
    }

  export interface PersonDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Person'], meta: { name: 'Person' } }
    /**
     * Find zero or one Person that matches the filter.
     * @param {PersonFindUniqueArgs} args - Arguments to find a Person
     * @example
     * // Get one Person
     * const person = await prisma.person.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PersonFindUniqueArgs>(args: SelectSubset<T, PersonFindUniqueArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Person that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {PersonFindUniqueOrThrowArgs} args - Arguments to find a Person
     * @example
     * // Get one Person
     * const person = await prisma.person.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PersonFindUniqueOrThrowArgs>(args: SelectSubset<T, PersonFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Person that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PersonFindFirstArgs} args - Arguments to find a Person
     * @example
     * // Get one Person
     * const person = await prisma.person.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PersonFindFirstArgs>(args?: SelectSubset<T, PersonFindFirstArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Person that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PersonFindFirstOrThrowArgs} args - Arguments to find a Person
     * @example
     * // Get one Person
     * const person = await prisma.person.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PersonFindFirstOrThrowArgs>(args?: SelectSubset<T, PersonFindFirstOrThrowArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more People that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PersonFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all People
     * const people = await prisma.person.findMany()
     * 
     * // Get first 10 People
     * const people = await prisma.person.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const personWithIdOnly = await prisma.person.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PersonFindManyArgs>(args?: SelectSubset<T, PersonFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Person.
     * @param {PersonCreateArgs} args - Arguments to create a Person.
     * @example
     * // Create one Person
     * const Person = await prisma.person.create({
     *   data: {
     *     // ... data to create a Person
     *   }
     * })
     * 
     */
    create<T extends PersonCreateArgs>(args: SelectSubset<T, PersonCreateArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many People.
     * @param {PersonCreateManyArgs} args - Arguments to create many People.
     * @example
     * // Create many People
     * const person = await prisma.person.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PersonCreateManyArgs>(args?: SelectSubset<T, PersonCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many People and returns the data saved in the database.
     * @param {PersonCreateManyAndReturnArgs} args - Arguments to create many People.
     * @example
     * // Create many People
     * const person = await prisma.person.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many People and only return the `id`
     * const personWithIdOnly = await prisma.person.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PersonCreateManyAndReturnArgs>(args?: SelectSubset<T, PersonCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Person.
     * @param {PersonDeleteArgs} args - Arguments to delete one Person.
     * @example
     * // Delete one Person
     * const Person = await prisma.person.delete({
     *   where: {
     *     // ... filter to delete one Person
     *   }
     * })
     * 
     */
    delete<T extends PersonDeleteArgs>(args: SelectSubset<T, PersonDeleteArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Person.
     * @param {PersonUpdateArgs} args - Arguments to update one Person.
     * @example
     * // Update one Person
     * const person = await prisma.person.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PersonUpdateArgs>(args: SelectSubset<T, PersonUpdateArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more People.
     * @param {PersonDeleteManyArgs} args - Arguments to filter People to delete.
     * @example
     * // Delete a few People
     * const { count } = await prisma.person.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PersonDeleteManyArgs>(args?: SelectSubset<T, PersonDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more People.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PersonUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many People
     * const person = await prisma.person.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PersonUpdateManyArgs>(args: SelectSubset<T, PersonUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Person.
     * @param {PersonUpsertArgs} args - Arguments to update or create a Person.
     * @example
     * // Update or create a Person
     * const person = await prisma.person.upsert({
     *   create: {
     *     // ... data to create a Person
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Person we want to update
     *   }
     * })
     */
    upsert<T extends PersonUpsertArgs>(args: SelectSubset<T, PersonUpsertArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of People.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PersonCountArgs} args - Arguments to filter People to count.
     * @example
     * // Count the number of People
     * const count = await prisma.person.count({
     *   where: {
     *     // ... the filter for the People we want to count
     *   }
     * })
    **/
    count<T extends PersonCountArgs>(
      args?: Subset<T, PersonCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PersonCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Person.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PersonAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PersonAggregateArgs>(args: Subset<T, PersonAggregateArgs>): Prisma.PrismaPromise<GetPersonAggregateType<T>>

    /**
     * Group by Person.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PersonGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PersonGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PersonGroupByArgs['orderBy'] }
        : { orderBy?: PersonGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PersonGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPersonGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Person model
   */
  readonly fields: PersonFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Person.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PersonClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    roles<T extends Person$rolesArgs<ExtArgs> = {}>(args?: Subset<T, Person$rolesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findMany"> | Null>
    sourceRecords<T extends Person$sourceRecordsArgs<ExtArgs> = {}>(args?: Subset<T, Person$sourceRecordsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "findMany"> | Null>
    matchDecisions<T extends Person$matchDecisionsArgs<ExtArgs> = {}>(args?: Subset<T, Person$matchDecisionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "findMany"> | Null>
    ycPerson<T extends Person$ycPersonArgs<ExtArgs> = {}>(args?: Subset<T, Person$ycPersonArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Person model
   */ 
  interface PersonFieldRefs {
    readonly id: FieldRef<"Person", 'String'>
    readonly canonicalName: FieldRef<"Person", 'String'>
    readonly dedupeKey: FieldRef<"Person", 'String'>
    readonly firstName: FieldRef<"Person", 'String'>
    readonly lastName: FieldRef<"Person", 'String'>
    readonly email: FieldRef<"Person", 'String'>
    readonly linkedinUrl: FieldRef<"Person", 'String'>
    readonly twitterUrl: FieldRef<"Person", 'String'>
    readonly githubUrl: FieldRef<"Person", 'String'>
    readonly avatarUrl: FieldRef<"Person", 'String'>
    readonly bio: FieldRef<"Person", 'String'>
    readonly location: FieldRef<"Person", 'String'>
    readonly city: FieldRef<"Person", 'String'>
    readonly country: FieldRef<"Person", 'String'>
    readonly expertise: FieldRef<"Person", 'String[]'>
    readonly ycId: FieldRef<"Person", 'String'>
    readonly sourceIds: FieldRef<"Person", 'String[]'>
    readonly createdAt: FieldRef<"Person", 'DateTime'>
    readonly updatedAt: FieldRef<"Person", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Person findUnique
   */
  export type PersonFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * Filter, which Person to fetch.
     */
    where: PersonWhereUniqueInput
  }

  /**
   * Person findUniqueOrThrow
   */
  export type PersonFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * Filter, which Person to fetch.
     */
    where: PersonWhereUniqueInput
  }

  /**
   * Person findFirst
   */
  export type PersonFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * Filter, which Person to fetch.
     */
    where?: PersonWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of People to fetch.
     */
    orderBy?: PersonOrderByWithRelationInput | PersonOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for People.
     */
    cursor?: PersonWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` People from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` People.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of People.
     */
    distinct?: PersonScalarFieldEnum | PersonScalarFieldEnum[]
  }

  /**
   * Person findFirstOrThrow
   */
  export type PersonFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * Filter, which Person to fetch.
     */
    where?: PersonWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of People to fetch.
     */
    orderBy?: PersonOrderByWithRelationInput | PersonOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for People.
     */
    cursor?: PersonWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` People from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` People.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of People.
     */
    distinct?: PersonScalarFieldEnum | PersonScalarFieldEnum[]
  }

  /**
   * Person findMany
   */
  export type PersonFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * Filter, which People to fetch.
     */
    where?: PersonWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of People to fetch.
     */
    orderBy?: PersonOrderByWithRelationInput | PersonOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing People.
     */
    cursor?: PersonWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` People from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` People.
     */
    skip?: number
    distinct?: PersonScalarFieldEnum | PersonScalarFieldEnum[]
  }

  /**
   * Person create
   */
  export type PersonCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * The data needed to create a Person.
     */
    data: XOR<PersonCreateInput, PersonUncheckedCreateInput>
  }

  /**
   * Person createMany
   */
  export type PersonCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many People.
     */
    data: PersonCreateManyInput | PersonCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Person createManyAndReturn
   */
  export type PersonCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many People.
     */
    data: PersonCreateManyInput | PersonCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Person update
   */
  export type PersonUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * The data needed to update a Person.
     */
    data: XOR<PersonUpdateInput, PersonUncheckedUpdateInput>
    /**
     * Choose, which Person to update.
     */
    where: PersonWhereUniqueInput
  }

  /**
   * Person updateMany
   */
  export type PersonUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update People.
     */
    data: XOR<PersonUpdateManyMutationInput, PersonUncheckedUpdateManyInput>
    /**
     * Filter which People to update
     */
    where?: PersonWhereInput
  }

  /**
   * Person upsert
   */
  export type PersonUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * The filter to search for the Person to update in case it exists.
     */
    where: PersonWhereUniqueInput
    /**
     * In case the Person found by the `where` argument doesn't exist, create a new Person with this data.
     */
    create: XOR<PersonCreateInput, PersonUncheckedCreateInput>
    /**
     * In case the Person was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PersonUpdateInput, PersonUncheckedUpdateInput>
  }

  /**
   * Person delete
   */
  export type PersonDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    /**
     * Filter which Person to delete.
     */
    where: PersonWhereUniqueInput
  }

  /**
   * Person deleteMany
   */
  export type PersonDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which People to delete
     */
    where?: PersonWhereInput
  }

  /**
   * Person.roles
   */
  export type Person$rolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    where?: RoleWhereInput
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    cursor?: RoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Person.sourceRecords
   */
  export type Person$sourceRecordsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    where?: SourceRecordWhereInput
    orderBy?: SourceRecordOrderByWithRelationInput | SourceRecordOrderByWithRelationInput[]
    cursor?: SourceRecordWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SourceRecordScalarFieldEnum | SourceRecordScalarFieldEnum[]
  }

  /**
   * Person.matchDecisions
   */
  export type Person$matchDecisionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    where?: MatchDecisionWhereInput
    orderBy?: MatchDecisionOrderByWithRelationInput | MatchDecisionOrderByWithRelationInput[]
    cursor?: MatchDecisionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MatchDecisionScalarFieldEnum | MatchDecisionScalarFieldEnum[]
  }

  /**
   * Person.ycPerson
   */
  export type Person$ycPersonArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    where?: YcPersonWhereInput
  }

  /**
   * Person without action
   */
  export type PersonDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
  }


  /**
   * Model Role
   */

  export type AggregateRole = {
    _count: RoleCountAggregateOutputType | null
    _min: RoleMinAggregateOutputType | null
    _max: RoleMaxAggregateOutputType | null
  }

  export type RoleMinAggregateOutputType = {
    id: string | null
    personId: string | null
    organizationId: string | null
    title: string | null
    roleType: string | null
    functionType: string | null
    isCurrent: boolean | null
    startDate: Date | null
    endDate: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type RoleMaxAggregateOutputType = {
    id: string | null
    personId: string | null
    organizationId: string | null
    title: string | null
    roleType: string | null
    functionType: string | null
    isCurrent: boolean | null
    startDate: Date | null
    endDate: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type RoleCountAggregateOutputType = {
    id: number
    personId: number
    organizationId: number
    title: number
    roleType: number
    functionType: number
    isCurrent: number
    startDate: number
    endDate: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type RoleMinAggregateInputType = {
    id?: true
    personId?: true
    organizationId?: true
    title?: true
    roleType?: true
    functionType?: true
    isCurrent?: true
    startDate?: true
    endDate?: true
    createdAt?: true
    updatedAt?: true
  }

  export type RoleMaxAggregateInputType = {
    id?: true
    personId?: true
    organizationId?: true
    title?: true
    roleType?: true
    functionType?: true
    isCurrent?: true
    startDate?: true
    endDate?: true
    createdAt?: true
    updatedAt?: true
  }

  export type RoleCountAggregateInputType = {
    id?: true
    personId?: true
    organizationId?: true
    title?: true
    roleType?: true
    functionType?: true
    isCurrent?: true
    startDate?: true
    endDate?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type RoleAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Role to aggregate.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Roles
    **/
    _count?: true | RoleCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RoleMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RoleMaxAggregateInputType
  }

  export type GetRoleAggregateType<T extends RoleAggregateArgs> = {
        [P in keyof T & keyof AggregateRole]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRole[P]>
      : GetScalarType<T[P], AggregateRole[P]>
  }




  export type RoleGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RoleWhereInput
    orderBy?: RoleOrderByWithAggregationInput | RoleOrderByWithAggregationInput[]
    by: RoleScalarFieldEnum[] | RoleScalarFieldEnum
    having?: RoleScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RoleCountAggregateInputType | true
    _min?: RoleMinAggregateInputType
    _max?: RoleMaxAggregateInputType
  }

  export type RoleGroupByOutputType = {
    id: string
    personId: string
    organizationId: string
    title: string | null
    roleType: string | null
    functionType: string | null
    isCurrent: boolean
    startDate: Date | null
    endDate: Date | null
    createdAt: Date
    updatedAt: Date
    _count: RoleCountAggregateOutputType | null
    _min: RoleMinAggregateOutputType | null
    _max: RoleMaxAggregateOutputType | null
  }

  type GetRoleGroupByPayload<T extends RoleGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RoleGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RoleGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RoleGroupByOutputType[P]>
            : GetScalarType<T[P], RoleGroupByOutputType[P]>
        }
      >
    >


  export type RoleSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    personId?: boolean
    organizationId?: boolean
    title?: boolean
    roleType?: boolean
    functionType?: boolean
    isCurrent?: boolean
    startDate?: boolean
    endDate?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    person?: boolean | PersonDefaultArgs<ExtArgs>
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["role"]>

  export type RoleSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    personId?: boolean
    organizationId?: boolean
    title?: boolean
    roleType?: boolean
    functionType?: boolean
    isCurrent?: boolean
    startDate?: boolean
    endDate?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    person?: boolean | PersonDefaultArgs<ExtArgs>
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["role"]>

  export type RoleSelectScalar = {
    id?: boolean
    personId?: boolean
    organizationId?: boolean
    title?: boolean
    roleType?: boolean
    functionType?: boolean
    isCurrent?: boolean
    startDate?: boolean
    endDate?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type RoleInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    person?: boolean | PersonDefaultArgs<ExtArgs>
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }
  export type RoleIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    person?: boolean | PersonDefaultArgs<ExtArgs>
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
  }

  export type $RolePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Role"
    objects: {
      person: Prisma.$PersonPayload<ExtArgs>
      organization: Prisma.$OrganizationPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      personId: string
      organizationId: string
      title: string | null
      roleType: string | null
      functionType: string | null
      isCurrent: boolean
      startDate: Date | null
      endDate: Date | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["role"]>
    composites: {}
  }

  type RoleGetPayload<S extends boolean | null | undefined | RoleDefaultArgs> = $Result.GetResult<Prisma.$RolePayload, S>

  type RoleCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<RoleFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: RoleCountAggregateInputType | true
    }

  export interface RoleDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Role'], meta: { name: 'Role' } }
    /**
     * Find zero or one Role that matches the filter.
     * @param {RoleFindUniqueArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RoleFindUniqueArgs>(args: SelectSubset<T, RoleFindUniqueArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Role that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {RoleFindUniqueOrThrowArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RoleFindUniqueOrThrowArgs>(args: SelectSubset<T, RoleFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Role that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindFirstArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RoleFindFirstArgs>(args?: SelectSubset<T, RoleFindFirstArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Role that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindFirstOrThrowArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RoleFindFirstOrThrowArgs>(args?: SelectSubset<T, RoleFindFirstOrThrowArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Roles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Roles
     * const roles = await prisma.role.findMany()
     * 
     * // Get first 10 Roles
     * const roles = await prisma.role.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const roleWithIdOnly = await prisma.role.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends RoleFindManyArgs>(args?: SelectSubset<T, RoleFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Role.
     * @param {RoleCreateArgs} args - Arguments to create a Role.
     * @example
     * // Create one Role
     * const Role = await prisma.role.create({
     *   data: {
     *     // ... data to create a Role
     *   }
     * })
     * 
     */
    create<T extends RoleCreateArgs>(args: SelectSubset<T, RoleCreateArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Roles.
     * @param {RoleCreateManyArgs} args - Arguments to create many Roles.
     * @example
     * // Create many Roles
     * const role = await prisma.role.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RoleCreateManyArgs>(args?: SelectSubset<T, RoleCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Roles and returns the data saved in the database.
     * @param {RoleCreateManyAndReturnArgs} args - Arguments to create many Roles.
     * @example
     * // Create many Roles
     * const role = await prisma.role.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Roles and only return the `id`
     * const roleWithIdOnly = await prisma.role.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends RoleCreateManyAndReturnArgs>(args?: SelectSubset<T, RoleCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Role.
     * @param {RoleDeleteArgs} args - Arguments to delete one Role.
     * @example
     * // Delete one Role
     * const Role = await prisma.role.delete({
     *   where: {
     *     // ... filter to delete one Role
     *   }
     * })
     * 
     */
    delete<T extends RoleDeleteArgs>(args: SelectSubset<T, RoleDeleteArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Role.
     * @param {RoleUpdateArgs} args - Arguments to update one Role.
     * @example
     * // Update one Role
     * const role = await prisma.role.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RoleUpdateArgs>(args: SelectSubset<T, RoleUpdateArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Roles.
     * @param {RoleDeleteManyArgs} args - Arguments to filter Roles to delete.
     * @example
     * // Delete a few Roles
     * const { count } = await prisma.role.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RoleDeleteManyArgs>(args?: SelectSubset<T, RoleDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Roles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Roles
     * const role = await prisma.role.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RoleUpdateManyArgs>(args: SelectSubset<T, RoleUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Role.
     * @param {RoleUpsertArgs} args - Arguments to update or create a Role.
     * @example
     * // Update or create a Role
     * const role = await prisma.role.upsert({
     *   create: {
     *     // ... data to create a Role
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Role we want to update
     *   }
     * })
     */
    upsert<T extends RoleUpsertArgs>(args: SelectSubset<T, RoleUpsertArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Roles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleCountArgs} args - Arguments to filter Roles to count.
     * @example
     * // Count the number of Roles
     * const count = await prisma.role.count({
     *   where: {
     *     // ... the filter for the Roles we want to count
     *   }
     * })
    **/
    count<T extends RoleCountArgs>(
      args?: Subset<T, RoleCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RoleCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Role.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends RoleAggregateArgs>(args: Subset<T, RoleAggregateArgs>): Prisma.PrismaPromise<GetRoleAggregateType<T>>

    /**
     * Group by Role.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends RoleGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RoleGroupByArgs['orderBy'] }
        : { orderBy?: RoleGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, RoleGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRoleGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Role model
   */
  readonly fields: RoleFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Role.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RoleClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    person<T extends PersonDefaultArgs<ExtArgs> = {}>(args?: Subset<T, PersonDefaultArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    organization<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Role model
   */ 
  interface RoleFieldRefs {
    readonly id: FieldRef<"Role", 'String'>
    readonly personId: FieldRef<"Role", 'String'>
    readonly organizationId: FieldRef<"Role", 'String'>
    readonly title: FieldRef<"Role", 'String'>
    readonly roleType: FieldRef<"Role", 'String'>
    readonly functionType: FieldRef<"Role", 'String'>
    readonly isCurrent: FieldRef<"Role", 'Boolean'>
    readonly startDate: FieldRef<"Role", 'DateTime'>
    readonly endDate: FieldRef<"Role", 'DateTime'>
    readonly createdAt: FieldRef<"Role", 'DateTime'>
    readonly updatedAt: FieldRef<"Role", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Role findUnique
   */
  export type RoleFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role findUniqueOrThrow
   */
  export type RoleFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role findFirst
   */
  export type RoleFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Roles.
     */
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role findFirstOrThrow
   */
  export type RoleFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Roles.
     */
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role findMany
   */
  export type RoleFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Roles to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role create
   */
  export type RoleCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The data needed to create a Role.
     */
    data: XOR<RoleCreateInput, RoleUncheckedCreateInput>
  }

  /**
   * Role createMany
   */
  export type RoleCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Roles.
     */
    data: RoleCreateManyInput | RoleCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Role createManyAndReturn
   */
  export type RoleCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Roles.
     */
    data: RoleCreateManyInput | RoleCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Role update
   */
  export type RoleUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The data needed to update a Role.
     */
    data: XOR<RoleUpdateInput, RoleUncheckedUpdateInput>
    /**
     * Choose, which Role to update.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role updateMany
   */
  export type RoleUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Roles.
     */
    data: XOR<RoleUpdateManyMutationInput, RoleUncheckedUpdateManyInput>
    /**
     * Filter which Roles to update
     */
    where?: RoleWhereInput
  }

  /**
   * Role upsert
   */
  export type RoleUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The filter to search for the Role to update in case it exists.
     */
    where: RoleWhereUniqueInput
    /**
     * In case the Role found by the `where` argument doesn't exist, create a new Role with this data.
     */
    create: XOR<RoleCreateInput, RoleUncheckedCreateInput>
    /**
     * In case the Role was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RoleUpdateInput, RoleUncheckedUpdateInput>
  }

  /**
   * Role delete
   */
  export type RoleDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter which Role to delete.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role deleteMany
   */
  export type RoleDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Roles to delete
     */
    where?: RoleWhereInput
  }

  /**
   * Role without action
   */
  export type RoleDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
  }


  /**
   * Model SourceRecord
   */

  export type AggregateSourceRecord = {
    _count: SourceRecordCountAggregateOutputType | null
    _min: SourceRecordMinAggregateOutputType | null
    _max: SourceRecordMaxAggregateOutputType | null
  }

  export type SourceRecordMinAggregateOutputType = {
    id: string | null
    sourceAdapter: string | null
    sourceUrl: string | null
    sourceId: string | null
    entityType: string | null
    fetchedAt: Date | null
    normalizedAt: Date | null
    organizationId: string | null
    personId: string | null
  }

  export type SourceRecordMaxAggregateOutputType = {
    id: string | null
    sourceAdapter: string | null
    sourceUrl: string | null
    sourceId: string | null
    entityType: string | null
    fetchedAt: Date | null
    normalizedAt: Date | null
    organizationId: string | null
    personId: string | null
  }

  export type SourceRecordCountAggregateOutputType = {
    id: number
    sourceAdapter: number
    sourceUrl: number
    sourceId: number
    rawPayload: number
    entityType: number
    fetchedAt: number
    normalizedAt: number
    organizationId: number
    personId: number
    _all: number
  }


  export type SourceRecordMinAggregateInputType = {
    id?: true
    sourceAdapter?: true
    sourceUrl?: true
    sourceId?: true
    entityType?: true
    fetchedAt?: true
    normalizedAt?: true
    organizationId?: true
    personId?: true
  }

  export type SourceRecordMaxAggregateInputType = {
    id?: true
    sourceAdapter?: true
    sourceUrl?: true
    sourceId?: true
    entityType?: true
    fetchedAt?: true
    normalizedAt?: true
    organizationId?: true
    personId?: true
  }

  export type SourceRecordCountAggregateInputType = {
    id?: true
    sourceAdapter?: true
    sourceUrl?: true
    sourceId?: true
    rawPayload?: true
    entityType?: true
    fetchedAt?: true
    normalizedAt?: true
    organizationId?: true
    personId?: true
    _all?: true
  }

  export type SourceRecordAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SourceRecord to aggregate.
     */
    where?: SourceRecordWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SourceRecords to fetch.
     */
    orderBy?: SourceRecordOrderByWithRelationInput | SourceRecordOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SourceRecordWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SourceRecords from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SourceRecords.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SourceRecords
    **/
    _count?: true | SourceRecordCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SourceRecordMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SourceRecordMaxAggregateInputType
  }

  export type GetSourceRecordAggregateType<T extends SourceRecordAggregateArgs> = {
        [P in keyof T & keyof AggregateSourceRecord]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSourceRecord[P]>
      : GetScalarType<T[P], AggregateSourceRecord[P]>
  }




  export type SourceRecordGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SourceRecordWhereInput
    orderBy?: SourceRecordOrderByWithAggregationInput | SourceRecordOrderByWithAggregationInput[]
    by: SourceRecordScalarFieldEnum[] | SourceRecordScalarFieldEnum
    having?: SourceRecordScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SourceRecordCountAggregateInputType | true
    _min?: SourceRecordMinAggregateInputType
    _max?: SourceRecordMaxAggregateInputType
  }

  export type SourceRecordGroupByOutputType = {
    id: string
    sourceAdapter: string
    sourceUrl: string
    sourceId: string | null
    rawPayload: JsonValue
    entityType: string
    fetchedAt: Date
    normalizedAt: Date | null
    organizationId: string | null
    personId: string | null
    _count: SourceRecordCountAggregateOutputType | null
    _min: SourceRecordMinAggregateOutputType | null
    _max: SourceRecordMaxAggregateOutputType | null
  }

  type GetSourceRecordGroupByPayload<T extends SourceRecordGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SourceRecordGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SourceRecordGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SourceRecordGroupByOutputType[P]>
            : GetScalarType<T[P], SourceRecordGroupByOutputType[P]>
        }
      >
    >


  export type SourceRecordSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sourceAdapter?: boolean
    sourceUrl?: boolean
    sourceId?: boolean
    rawPayload?: boolean
    entityType?: boolean
    fetchedAt?: boolean
    normalizedAt?: boolean
    organizationId?: boolean
    personId?: boolean
    organization?: boolean | SourceRecord$organizationArgs<ExtArgs>
    person?: boolean | SourceRecord$personArgs<ExtArgs>
  }, ExtArgs["result"]["sourceRecord"]>

  export type SourceRecordSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sourceAdapter?: boolean
    sourceUrl?: boolean
    sourceId?: boolean
    rawPayload?: boolean
    entityType?: boolean
    fetchedAt?: boolean
    normalizedAt?: boolean
    organizationId?: boolean
    personId?: boolean
    organization?: boolean | SourceRecord$organizationArgs<ExtArgs>
    person?: boolean | SourceRecord$personArgs<ExtArgs>
  }, ExtArgs["result"]["sourceRecord"]>

  export type SourceRecordSelectScalar = {
    id?: boolean
    sourceAdapter?: boolean
    sourceUrl?: boolean
    sourceId?: boolean
    rawPayload?: boolean
    entityType?: boolean
    fetchedAt?: boolean
    normalizedAt?: boolean
    organizationId?: boolean
    personId?: boolean
  }

  export type SourceRecordInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | SourceRecord$organizationArgs<ExtArgs>
    person?: boolean | SourceRecord$personArgs<ExtArgs>
  }
  export type SourceRecordIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | SourceRecord$organizationArgs<ExtArgs>
    person?: boolean | SourceRecord$personArgs<ExtArgs>
  }

  export type $SourceRecordPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SourceRecord"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs> | null
      person: Prisma.$PersonPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      sourceAdapter: string
      sourceUrl: string
      sourceId: string | null
      rawPayload: Prisma.JsonValue
      entityType: string
      fetchedAt: Date
      normalizedAt: Date | null
      organizationId: string | null
      personId: string | null
    }, ExtArgs["result"]["sourceRecord"]>
    composites: {}
  }

  type SourceRecordGetPayload<S extends boolean | null | undefined | SourceRecordDefaultArgs> = $Result.GetResult<Prisma.$SourceRecordPayload, S>

  type SourceRecordCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<SourceRecordFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: SourceRecordCountAggregateInputType | true
    }

  export interface SourceRecordDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SourceRecord'], meta: { name: 'SourceRecord' } }
    /**
     * Find zero or one SourceRecord that matches the filter.
     * @param {SourceRecordFindUniqueArgs} args - Arguments to find a SourceRecord
     * @example
     * // Get one SourceRecord
     * const sourceRecord = await prisma.sourceRecord.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SourceRecordFindUniqueArgs>(args: SelectSubset<T, SourceRecordFindUniqueArgs<ExtArgs>>): Prisma__SourceRecordClient<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one SourceRecord that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {SourceRecordFindUniqueOrThrowArgs} args - Arguments to find a SourceRecord
     * @example
     * // Get one SourceRecord
     * const sourceRecord = await prisma.sourceRecord.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SourceRecordFindUniqueOrThrowArgs>(args: SelectSubset<T, SourceRecordFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SourceRecordClient<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first SourceRecord that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SourceRecordFindFirstArgs} args - Arguments to find a SourceRecord
     * @example
     * // Get one SourceRecord
     * const sourceRecord = await prisma.sourceRecord.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SourceRecordFindFirstArgs>(args?: SelectSubset<T, SourceRecordFindFirstArgs<ExtArgs>>): Prisma__SourceRecordClient<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first SourceRecord that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SourceRecordFindFirstOrThrowArgs} args - Arguments to find a SourceRecord
     * @example
     * // Get one SourceRecord
     * const sourceRecord = await prisma.sourceRecord.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SourceRecordFindFirstOrThrowArgs>(args?: SelectSubset<T, SourceRecordFindFirstOrThrowArgs<ExtArgs>>): Prisma__SourceRecordClient<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more SourceRecords that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SourceRecordFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SourceRecords
     * const sourceRecords = await prisma.sourceRecord.findMany()
     * 
     * // Get first 10 SourceRecords
     * const sourceRecords = await prisma.sourceRecord.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const sourceRecordWithIdOnly = await prisma.sourceRecord.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SourceRecordFindManyArgs>(args?: SelectSubset<T, SourceRecordFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a SourceRecord.
     * @param {SourceRecordCreateArgs} args - Arguments to create a SourceRecord.
     * @example
     * // Create one SourceRecord
     * const SourceRecord = await prisma.sourceRecord.create({
     *   data: {
     *     // ... data to create a SourceRecord
     *   }
     * })
     * 
     */
    create<T extends SourceRecordCreateArgs>(args: SelectSubset<T, SourceRecordCreateArgs<ExtArgs>>): Prisma__SourceRecordClient<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many SourceRecords.
     * @param {SourceRecordCreateManyArgs} args - Arguments to create many SourceRecords.
     * @example
     * // Create many SourceRecords
     * const sourceRecord = await prisma.sourceRecord.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SourceRecordCreateManyArgs>(args?: SelectSubset<T, SourceRecordCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SourceRecords and returns the data saved in the database.
     * @param {SourceRecordCreateManyAndReturnArgs} args - Arguments to create many SourceRecords.
     * @example
     * // Create many SourceRecords
     * const sourceRecord = await prisma.sourceRecord.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SourceRecords and only return the `id`
     * const sourceRecordWithIdOnly = await prisma.sourceRecord.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SourceRecordCreateManyAndReturnArgs>(args?: SelectSubset<T, SourceRecordCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a SourceRecord.
     * @param {SourceRecordDeleteArgs} args - Arguments to delete one SourceRecord.
     * @example
     * // Delete one SourceRecord
     * const SourceRecord = await prisma.sourceRecord.delete({
     *   where: {
     *     // ... filter to delete one SourceRecord
     *   }
     * })
     * 
     */
    delete<T extends SourceRecordDeleteArgs>(args: SelectSubset<T, SourceRecordDeleteArgs<ExtArgs>>): Prisma__SourceRecordClient<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one SourceRecord.
     * @param {SourceRecordUpdateArgs} args - Arguments to update one SourceRecord.
     * @example
     * // Update one SourceRecord
     * const sourceRecord = await prisma.sourceRecord.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SourceRecordUpdateArgs>(args: SelectSubset<T, SourceRecordUpdateArgs<ExtArgs>>): Prisma__SourceRecordClient<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more SourceRecords.
     * @param {SourceRecordDeleteManyArgs} args - Arguments to filter SourceRecords to delete.
     * @example
     * // Delete a few SourceRecords
     * const { count } = await prisma.sourceRecord.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SourceRecordDeleteManyArgs>(args?: SelectSubset<T, SourceRecordDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SourceRecords.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SourceRecordUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SourceRecords
     * const sourceRecord = await prisma.sourceRecord.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SourceRecordUpdateManyArgs>(args: SelectSubset<T, SourceRecordUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one SourceRecord.
     * @param {SourceRecordUpsertArgs} args - Arguments to update or create a SourceRecord.
     * @example
     * // Update or create a SourceRecord
     * const sourceRecord = await prisma.sourceRecord.upsert({
     *   create: {
     *     // ... data to create a SourceRecord
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SourceRecord we want to update
     *   }
     * })
     */
    upsert<T extends SourceRecordUpsertArgs>(args: SelectSubset<T, SourceRecordUpsertArgs<ExtArgs>>): Prisma__SourceRecordClient<$Result.GetResult<Prisma.$SourceRecordPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of SourceRecords.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SourceRecordCountArgs} args - Arguments to filter SourceRecords to count.
     * @example
     * // Count the number of SourceRecords
     * const count = await prisma.sourceRecord.count({
     *   where: {
     *     // ... the filter for the SourceRecords we want to count
     *   }
     * })
    **/
    count<T extends SourceRecordCountArgs>(
      args?: Subset<T, SourceRecordCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SourceRecordCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SourceRecord.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SourceRecordAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SourceRecordAggregateArgs>(args: Subset<T, SourceRecordAggregateArgs>): Prisma.PrismaPromise<GetSourceRecordAggregateType<T>>

    /**
     * Group by SourceRecord.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SourceRecordGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SourceRecordGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SourceRecordGroupByArgs['orderBy'] }
        : { orderBy?: SourceRecordGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SourceRecordGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSourceRecordGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SourceRecord model
   */
  readonly fields: SourceRecordFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SourceRecord.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SourceRecordClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends SourceRecord$organizationArgs<ExtArgs> = {}>(args?: Subset<T, SourceRecord$organizationArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    person<T extends SourceRecord$personArgs<ExtArgs> = {}>(args?: Subset<T, SourceRecord$personArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SourceRecord model
   */ 
  interface SourceRecordFieldRefs {
    readonly id: FieldRef<"SourceRecord", 'String'>
    readonly sourceAdapter: FieldRef<"SourceRecord", 'String'>
    readonly sourceUrl: FieldRef<"SourceRecord", 'String'>
    readonly sourceId: FieldRef<"SourceRecord", 'String'>
    readonly rawPayload: FieldRef<"SourceRecord", 'Json'>
    readonly entityType: FieldRef<"SourceRecord", 'String'>
    readonly fetchedAt: FieldRef<"SourceRecord", 'DateTime'>
    readonly normalizedAt: FieldRef<"SourceRecord", 'DateTime'>
    readonly organizationId: FieldRef<"SourceRecord", 'String'>
    readonly personId: FieldRef<"SourceRecord", 'String'>
  }
    

  // Custom InputTypes
  /**
   * SourceRecord findUnique
   */
  export type SourceRecordFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * Filter, which SourceRecord to fetch.
     */
    where: SourceRecordWhereUniqueInput
  }

  /**
   * SourceRecord findUniqueOrThrow
   */
  export type SourceRecordFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * Filter, which SourceRecord to fetch.
     */
    where: SourceRecordWhereUniqueInput
  }

  /**
   * SourceRecord findFirst
   */
  export type SourceRecordFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * Filter, which SourceRecord to fetch.
     */
    where?: SourceRecordWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SourceRecords to fetch.
     */
    orderBy?: SourceRecordOrderByWithRelationInput | SourceRecordOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SourceRecords.
     */
    cursor?: SourceRecordWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SourceRecords from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SourceRecords.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SourceRecords.
     */
    distinct?: SourceRecordScalarFieldEnum | SourceRecordScalarFieldEnum[]
  }

  /**
   * SourceRecord findFirstOrThrow
   */
  export type SourceRecordFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * Filter, which SourceRecord to fetch.
     */
    where?: SourceRecordWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SourceRecords to fetch.
     */
    orderBy?: SourceRecordOrderByWithRelationInput | SourceRecordOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SourceRecords.
     */
    cursor?: SourceRecordWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SourceRecords from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SourceRecords.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SourceRecords.
     */
    distinct?: SourceRecordScalarFieldEnum | SourceRecordScalarFieldEnum[]
  }

  /**
   * SourceRecord findMany
   */
  export type SourceRecordFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * Filter, which SourceRecords to fetch.
     */
    where?: SourceRecordWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SourceRecords to fetch.
     */
    orderBy?: SourceRecordOrderByWithRelationInput | SourceRecordOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SourceRecords.
     */
    cursor?: SourceRecordWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SourceRecords from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SourceRecords.
     */
    skip?: number
    distinct?: SourceRecordScalarFieldEnum | SourceRecordScalarFieldEnum[]
  }

  /**
   * SourceRecord create
   */
  export type SourceRecordCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * The data needed to create a SourceRecord.
     */
    data: XOR<SourceRecordCreateInput, SourceRecordUncheckedCreateInput>
  }

  /**
   * SourceRecord createMany
   */
  export type SourceRecordCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SourceRecords.
     */
    data: SourceRecordCreateManyInput | SourceRecordCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SourceRecord createManyAndReturn
   */
  export type SourceRecordCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many SourceRecords.
     */
    data: SourceRecordCreateManyInput | SourceRecordCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SourceRecord update
   */
  export type SourceRecordUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * The data needed to update a SourceRecord.
     */
    data: XOR<SourceRecordUpdateInput, SourceRecordUncheckedUpdateInput>
    /**
     * Choose, which SourceRecord to update.
     */
    where: SourceRecordWhereUniqueInput
  }

  /**
   * SourceRecord updateMany
   */
  export type SourceRecordUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SourceRecords.
     */
    data: XOR<SourceRecordUpdateManyMutationInput, SourceRecordUncheckedUpdateManyInput>
    /**
     * Filter which SourceRecords to update
     */
    where?: SourceRecordWhereInput
  }

  /**
   * SourceRecord upsert
   */
  export type SourceRecordUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * The filter to search for the SourceRecord to update in case it exists.
     */
    where: SourceRecordWhereUniqueInput
    /**
     * In case the SourceRecord found by the `where` argument doesn't exist, create a new SourceRecord with this data.
     */
    create: XOR<SourceRecordCreateInput, SourceRecordUncheckedCreateInput>
    /**
     * In case the SourceRecord was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SourceRecordUpdateInput, SourceRecordUncheckedUpdateInput>
  }

  /**
   * SourceRecord delete
   */
  export type SourceRecordDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
    /**
     * Filter which SourceRecord to delete.
     */
    where: SourceRecordWhereUniqueInput
  }

  /**
   * SourceRecord deleteMany
   */
  export type SourceRecordDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SourceRecords to delete
     */
    where?: SourceRecordWhereInput
  }

  /**
   * SourceRecord.organization
   */
  export type SourceRecord$organizationArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    where?: OrganizationWhereInput
  }

  /**
   * SourceRecord.person
   */
  export type SourceRecord$personArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    where?: PersonWhereInput
  }

  /**
   * SourceRecord without action
   */
  export type SourceRecordDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SourceRecord
     */
    select?: SourceRecordSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SourceRecordInclude<ExtArgs> | null
  }


  /**
   * Model IngestionJob
   */

  export type AggregateIngestionJob = {
    _count: IngestionJobCountAggregateOutputType | null
    _min: IngestionJobMinAggregateOutputType | null
    _max: IngestionJobMaxAggregateOutputType | null
  }

  export type IngestionJobMinAggregateOutputType = {
    id: string | null
    sourceAdapter: string | null
    status: string | null
    triggeredBy: string | null
    error: string | null
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type IngestionJobMaxAggregateOutputType = {
    id: string | null
    sourceAdapter: string | null
    status: string | null
    triggeredBy: string | null
    error: string | null
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type IngestionJobCountAggregateOutputType = {
    id: number
    sourceAdapter: number
    status: number
    triggeredBy: number
    error: number
    stats: number
    startedAt: number
    completedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type IngestionJobMinAggregateInputType = {
    id?: true
    sourceAdapter?: true
    status?: true
    triggeredBy?: true
    error?: true
    startedAt?: true
    completedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type IngestionJobMaxAggregateInputType = {
    id?: true
    sourceAdapter?: true
    status?: true
    triggeredBy?: true
    error?: true
    startedAt?: true
    completedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type IngestionJobCountAggregateInputType = {
    id?: true
    sourceAdapter?: true
    status?: true
    triggeredBy?: true
    error?: true
    stats?: true
    startedAt?: true
    completedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type IngestionJobAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which IngestionJob to aggregate.
     */
    where?: IngestionJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of IngestionJobs to fetch.
     */
    orderBy?: IngestionJobOrderByWithRelationInput | IngestionJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: IngestionJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` IngestionJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` IngestionJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned IngestionJobs
    **/
    _count?: true | IngestionJobCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: IngestionJobMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: IngestionJobMaxAggregateInputType
  }

  export type GetIngestionJobAggregateType<T extends IngestionJobAggregateArgs> = {
        [P in keyof T & keyof AggregateIngestionJob]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateIngestionJob[P]>
      : GetScalarType<T[P], AggregateIngestionJob[P]>
  }




  export type IngestionJobGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: IngestionJobWhereInput
    orderBy?: IngestionJobOrderByWithAggregationInput | IngestionJobOrderByWithAggregationInput[]
    by: IngestionJobScalarFieldEnum[] | IngestionJobScalarFieldEnum
    having?: IngestionJobScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: IngestionJobCountAggregateInputType | true
    _min?: IngestionJobMinAggregateInputType
    _max?: IngestionJobMaxAggregateInputType
  }

  export type IngestionJobGroupByOutputType = {
    id: string
    sourceAdapter: string
    status: string
    triggeredBy: string | null
    error: string | null
    stats: JsonValue | null
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
    _count: IngestionJobCountAggregateOutputType | null
    _min: IngestionJobMinAggregateOutputType | null
    _max: IngestionJobMaxAggregateOutputType | null
  }

  type GetIngestionJobGroupByPayload<T extends IngestionJobGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<IngestionJobGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof IngestionJobGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], IngestionJobGroupByOutputType[P]>
            : GetScalarType<T[P], IngestionJobGroupByOutputType[P]>
        }
      >
    >


  export type IngestionJobSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sourceAdapter?: boolean
    status?: boolean
    triggeredBy?: boolean
    error?: boolean
    stats?: boolean
    startedAt?: boolean
    completedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["ingestionJob"]>

  export type IngestionJobSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sourceAdapter?: boolean
    status?: boolean
    triggeredBy?: boolean
    error?: boolean
    stats?: boolean
    startedAt?: boolean
    completedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["ingestionJob"]>

  export type IngestionJobSelectScalar = {
    id?: boolean
    sourceAdapter?: boolean
    status?: boolean
    triggeredBy?: boolean
    error?: boolean
    stats?: boolean
    startedAt?: boolean
    completedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }


  export type $IngestionJobPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "IngestionJob"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      sourceAdapter: string
      status: string
      triggeredBy: string | null
      error: string | null
      stats: Prisma.JsonValue | null
      startedAt: Date | null
      completedAt: Date | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["ingestionJob"]>
    composites: {}
  }

  type IngestionJobGetPayload<S extends boolean | null | undefined | IngestionJobDefaultArgs> = $Result.GetResult<Prisma.$IngestionJobPayload, S>

  type IngestionJobCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<IngestionJobFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: IngestionJobCountAggregateInputType | true
    }

  export interface IngestionJobDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['IngestionJob'], meta: { name: 'IngestionJob' } }
    /**
     * Find zero or one IngestionJob that matches the filter.
     * @param {IngestionJobFindUniqueArgs} args - Arguments to find a IngestionJob
     * @example
     * // Get one IngestionJob
     * const ingestionJob = await prisma.ingestionJob.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends IngestionJobFindUniqueArgs>(args: SelectSubset<T, IngestionJobFindUniqueArgs<ExtArgs>>): Prisma__IngestionJobClient<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one IngestionJob that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {IngestionJobFindUniqueOrThrowArgs} args - Arguments to find a IngestionJob
     * @example
     * // Get one IngestionJob
     * const ingestionJob = await prisma.ingestionJob.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends IngestionJobFindUniqueOrThrowArgs>(args: SelectSubset<T, IngestionJobFindUniqueOrThrowArgs<ExtArgs>>): Prisma__IngestionJobClient<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first IngestionJob that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngestionJobFindFirstArgs} args - Arguments to find a IngestionJob
     * @example
     * // Get one IngestionJob
     * const ingestionJob = await prisma.ingestionJob.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends IngestionJobFindFirstArgs>(args?: SelectSubset<T, IngestionJobFindFirstArgs<ExtArgs>>): Prisma__IngestionJobClient<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first IngestionJob that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngestionJobFindFirstOrThrowArgs} args - Arguments to find a IngestionJob
     * @example
     * // Get one IngestionJob
     * const ingestionJob = await prisma.ingestionJob.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends IngestionJobFindFirstOrThrowArgs>(args?: SelectSubset<T, IngestionJobFindFirstOrThrowArgs<ExtArgs>>): Prisma__IngestionJobClient<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more IngestionJobs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngestionJobFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all IngestionJobs
     * const ingestionJobs = await prisma.ingestionJob.findMany()
     * 
     * // Get first 10 IngestionJobs
     * const ingestionJobs = await prisma.ingestionJob.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const ingestionJobWithIdOnly = await prisma.ingestionJob.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends IngestionJobFindManyArgs>(args?: SelectSubset<T, IngestionJobFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a IngestionJob.
     * @param {IngestionJobCreateArgs} args - Arguments to create a IngestionJob.
     * @example
     * // Create one IngestionJob
     * const IngestionJob = await prisma.ingestionJob.create({
     *   data: {
     *     // ... data to create a IngestionJob
     *   }
     * })
     * 
     */
    create<T extends IngestionJobCreateArgs>(args: SelectSubset<T, IngestionJobCreateArgs<ExtArgs>>): Prisma__IngestionJobClient<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many IngestionJobs.
     * @param {IngestionJobCreateManyArgs} args - Arguments to create many IngestionJobs.
     * @example
     * // Create many IngestionJobs
     * const ingestionJob = await prisma.ingestionJob.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends IngestionJobCreateManyArgs>(args?: SelectSubset<T, IngestionJobCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many IngestionJobs and returns the data saved in the database.
     * @param {IngestionJobCreateManyAndReturnArgs} args - Arguments to create many IngestionJobs.
     * @example
     * // Create many IngestionJobs
     * const ingestionJob = await prisma.ingestionJob.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many IngestionJobs and only return the `id`
     * const ingestionJobWithIdOnly = await prisma.ingestionJob.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends IngestionJobCreateManyAndReturnArgs>(args?: SelectSubset<T, IngestionJobCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a IngestionJob.
     * @param {IngestionJobDeleteArgs} args - Arguments to delete one IngestionJob.
     * @example
     * // Delete one IngestionJob
     * const IngestionJob = await prisma.ingestionJob.delete({
     *   where: {
     *     // ... filter to delete one IngestionJob
     *   }
     * })
     * 
     */
    delete<T extends IngestionJobDeleteArgs>(args: SelectSubset<T, IngestionJobDeleteArgs<ExtArgs>>): Prisma__IngestionJobClient<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one IngestionJob.
     * @param {IngestionJobUpdateArgs} args - Arguments to update one IngestionJob.
     * @example
     * // Update one IngestionJob
     * const ingestionJob = await prisma.ingestionJob.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends IngestionJobUpdateArgs>(args: SelectSubset<T, IngestionJobUpdateArgs<ExtArgs>>): Prisma__IngestionJobClient<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more IngestionJobs.
     * @param {IngestionJobDeleteManyArgs} args - Arguments to filter IngestionJobs to delete.
     * @example
     * // Delete a few IngestionJobs
     * const { count } = await prisma.ingestionJob.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends IngestionJobDeleteManyArgs>(args?: SelectSubset<T, IngestionJobDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more IngestionJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngestionJobUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many IngestionJobs
     * const ingestionJob = await prisma.ingestionJob.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends IngestionJobUpdateManyArgs>(args: SelectSubset<T, IngestionJobUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one IngestionJob.
     * @param {IngestionJobUpsertArgs} args - Arguments to update or create a IngestionJob.
     * @example
     * // Update or create a IngestionJob
     * const ingestionJob = await prisma.ingestionJob.upsert({
     *   create: {
     *     // ... data to create a IngestionJob
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the IngestionJob we want to update
     *   }
     * })
     */
    upsert<T extends IngestionJobUpsertArgs>(args: SelectSubset<T, IngestionJobUpsertArgs<ExtArgs>>): Prisma__IngestionJobClient<$Result.GetResult<Prisma.$IngestionJobPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of IngestionJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngestionJobCountArgs} args - Arguments to filter IngestionJobs to count.
     * @example
     * // Count the number of IngestionJobs
     * const count = await prisma.ingestionJob.count({
     *   where: {
     *     // ... the filter for the IngestionJobs we want to count
     *   }
     * })
    **/
    count<T extends IngestionJobCountArgs>(
      args?: Subset<T, IngestionJobCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], IngestionJobCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a IngestionJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngestionJobAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends IngestionJobAggregateArgs>(args: Subset<T, IngestionJobAggregateArgs>): Prisma.PrismaPromise<GetIngestionJobAggregateType<T>>

    /**
     * Group by IngestionJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {IngestionJobGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends IngestionJobGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: IngestionJobGroupByArgs['orderBy'] }
        : { orderBy?: IngestionJobGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, IngestionJobGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetIngestionJobGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the IngestionJob model
   */
  readonly fields: IngestionJobFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for IngestionJob.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__IngestionJobClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the IngestionJob model
   */ 
  interface IngestionJobFieldRefs {
    readonly id: FieldRef<"IngestionJob", 'String'>
    readonly sourceAdapter: FieldRef<"IngestionJob", 'String'>
    readonly status: FieldRef<"IngestionJob", 'String'>
    readonly triggeredBy: FieldRef<"IngestionJob", 'String'>
    readonly error: FieldRef<"IngestionJob", 'String'>
    readonly stats: FieldRef<"IngestionJob", 'Json'>
    readonly startedAt: FieldRef<"IngestionJob", 'DateTime'>
    readonly completedAt: FieldRef<"IngestionJob", 'DateTime'>
    readonly createdAt: FieldRef<"IngestionJob", 'DateTime'>
    readonly updatedAt: FieldRef<"IngestionJob", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * IngestionJob findUnique
   */
  export type IngestionJobFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * Filter, which IngestionJob to fetch.
     */
    where: IngestionJobWhereUniqueInput
  }

  /**
   * IngestionJob findUniqueOrThrow
   */
  export type IngestionJobFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * Filter, which IngestionJob to fetch.
     */
    where: IngestionJobWhereUniqueInput
  }

  /**
   * IngestionJob findFirst
   */
  export type IngestionJobFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * Filter, which IngestionJob to fetch.
     */
    where?: IngestionJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of IngestionJobs to fetch.
     */
    orderBy?: IngestionJobOrderByWithRelationInput | IngestionJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for IngestionJobs.
     */
    cursor?: IngestionJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` IngestionJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` IngestionJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of IngestionJobs.
     */
    distinct?: IngestionJobScalarFieldEnum | IngestionJobScalarFieldEnum[]
  }

  /**
   * IngestionJob findFirstOrThrow
   */
  export type IngestionJobFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * Filter, which IngestionJob to fetch.
     */
    where?: IngestionJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of IngestionJobs to fetch.
     */
    orderBy?: IngestionJobOrderByWithRelationInput | IngestionJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for IngestionJobs.
     */
    cursor?: IngestionJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` IngestionJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` IngestionJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of IngestionJobs.
     */
    distinct?: IngestionJobScalarFieldEnum | IngestionJobScalarFieldEnum[]
  }

  /**
   * IngestionJob findMany
   */
  export type IngestionJobFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * Filter, which IngestionJobs to fetch.
     */
    where?: IngestionJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of IngestionJobs to fetch.
     */
    orderBy?: IngestionJobOrderByWithRelationInput | IngestionJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing IngestionJobs.
     */
    cursor?: IngestionJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` IngestionJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` IngestionJobs.
     */
    skip?: number
    distinct?: IngestionJobScalarFieldEnum | IngestionJobScalarFieldEnum[]
  }

  /**
   * IngestionJob create
   */
  export type IngestionJobCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * The data needed to create a IngestionJob.
     */
    data: XOR<IngestionJobCreateInput, IngestionJobUncheckedCreateInput>
  }

  /**
   * IngestionJob createMany
   */
  export type IngestionJobCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many IngestionJobs.
     */
    data: IngestionJobCreateManyInput | IngestionJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * IngestionJob createManyAndReturn
   */
  export type IngestionJobCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many IngestionJobs.
     */
    data: IngestionJobCreateManyInput | IngestionJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * IngestionJob update
   */
  export type IngestionJobUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * The data needed to update a IngestionJob.
     */
    data: XOR<IngestionJobUpdateInput, IngestionJobUncheckedUpdateInput>
    /**
     * Choose, which IngestionJob to update.
     */
    where: IngestionJobWhereUniqueInput
  }

  /**
   * IngestionJob updateMany
   */
  export type IngestionJobUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update IngestionJobs.
     */
    data: XOR<IngestionJobUpdateManyMutationInput, IngestionJobUncheckedUpdateManyInput>
    /**
     * Filter which IngestionJobs to update
     */
    where?: IngestionJobWhereInput
  }

  /**
   * IngestionJob upsert
   */
  export type IngestionJobUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * The filter to search for the IngestionJob to update in case it exists.
     */
    where: IngestionJobWhereUniqueInput
    /**
     * In case the IngestionJob found by the `where` argument doesn't exist, create a new IngestionJob with this data.
     */
    create: XOR<IngestionJobCreateInput, IngestionJobUncheckedCreateInput>
    /**
     * In case the IngestionJob was found with the provided `where` argument, update it with this data.
     */
    update: XOR<IngestionJobUpdateInput, IngestionJobUncheckedUpdateInput>
  }

  /**
   * IngestionJob delete
   */
  export type IngestionJobDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
    /**
     * Filter which IngestionJob to delete.
     */
    where: IngestionJobWhereUniqueInput
  }

  /**
   * IngestionJob deleteMany
   */
  export type IngestionJobDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which IngestionJobs to delete
     */
    where?: IngestionJobWhereInput
  }

  /**
   * IngestionJob without action
   */
  export type IngestionJobDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the IngestionJob
     */
    select?: IngestionJobSelect<ExtArgs> | null
  }


  /**
   * Model YcCompany
   */

  export type AggregateYcCompany = {
    _count: YcCompanyCountAggregateOutputType | null
    _avg: YcCompanyAvgAggregateOutputType | null
    _sum: YcCompanySumAggregateOutputType | null
    _min: YcCompanyMinAggregateOutputType | null
    _max: YcCompanyMaxAggregateOutputType | null
  }

  export type YcCompanyAvgAggregateOutputType = {
    teamSize: number | null
  }

  export type YcCompanySumAggregateOutputType = {
    teamSize: number | null
  }

  export type YcCompanyMinAggregateOutputType = {
    id: string | null
    ycId: string | null
    slug: string | null
    name: string | null
    batch: string | null
    status: string | null
    website: string | null
    description: string | null
    longDescription: string | null
    teamSize: number | null
    allLocations: string | null
    organizationId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type YcCompanyMaxAggregateOutputType = {
    id: string | null
    ycId: string | null
    slug: string | null
    name: string | null
    batch: string | null
    status: string | null
    website: string | null
    description: string | null
    longDescription: string | null
    teamSize: number | null
    allLocations: string | null
    organizationId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type YcCompanyCountAggregateOutputType = {
    id: number
    ycId: number
    slug: number
    name: number
    batch: number
    status: number
    website: number
    description: number
    longDescription: number
    teamSize: number
    allLocations: number
    industries: number
    subverticals: number
    tags: number
    badges: number
    foundersRaw: number
    rawJson: number
    organizationId: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type YcCompanyAvgAggregateInputType = {
    teamSize?: true
  }

  export type YcCompanySumAggregateInputType = {
    teamSize?: true
  }

  export type YcCompanyMinAggregateInputType = {
    id?: true
    ycId?: true
    slug?: true
    name?: true
    batch?: true
    status?: true
    website?: true
    description?: true
    longDescription?: true
    teamSize?: true
    allLocations?: true
    organizationId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type YcCompanyMaxAggregateInputType = {
    id?: true
    ycId?: true
    slug?: true
    name?: true
    batch?: true
    status?: true
    website?: true
    description?: true
    longDescription?: true
    teamSize?: true
    allLocations?: true
    organizationId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type YcCompanyCountAggregateInputType = {
    id?: true
    ycId?: true
    slug?: true
    name?: true
    batch?: true
    status?: true
    website?: true
    description?: true
    longDescription?: true
    teamSize?: true
    allLocations?: true
    industries?: true
    subverticals?: true
    tags?: true
    badges?: true
    foundersRaw?: true
    rawJson?: true
    organizationId?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type YcCompanyAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which YcCompany to aggregate.
     */
    where?: YcCompanyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of YcCompanies to fetch.
     */
    orderBy?: YcCompanyOrderByWithRelationInput | YcCompanyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: YcCompanyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` YcCompanies from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` YcCompanies.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned YcCompanies
    **/
    _count?: true | YcCompanyCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: YcCompanyAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: YcCompanySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: YcCompanyMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: YcCompanyMaxAggregateInputType
  }

  export type GetYcCompanyAggregateType<T extends YcCompanyAggregateArgs> = {
        [P in keyof T & keyof AggregateYcCompany]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateYcCompany[P]>
      : GetScalarType<T[P], AggregateYcCompany[P]>
  }




  export type YcCompanyGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: YcCompanyWhereInput
    orderBy?: YcCompanyOrderByWithAggregationInput | YcCompanyOrderByWithAggregationInput[]
    by: YcCompanyScalarFieldEnum[] | YcCompanyScalarFieldEnum
    having?: YcCompanyScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: YcCompanyCountAggregateInputType | true
    _avg?: YcCompanyAvgAggregateInputType
    _sum?: YcCompanySumAggregateInputType
    _min?: YcCompanyMinAggregateInputType
    _max?: YcCompanyMaxAggregateInputType
  }

  export type YcCompanyGroupByOutputType = {
    id: string
    ycId: string
    slug: string
    name: string
    batch: string
    status: string | null
    website: string | null
    description: string | null
    longDescription: string | null
    teamSize: number | null
    allLocations: string | null
    industries: string[]
    subverticals: string[]
    tags: string[]
    badges: JsonValue | null
    foundersRaw: JsonValue | null
    rawJson: JsonValue
    organizationId: string | null
    createdAt: Date
    updatedAt: Date
    _count: YcCompanyCountAggregateOutputType | null
    _avg: YcCompanyAvgAggregateOutputType | null
    _sum: YcCompanySumAggregateOutputType | null
    _min: YcCompanyMinAggregateOutputType | null
    _max: YcCompanyMaxAggregateOutputType | null
  }

  type GetYcCompanyGroupByPayload<T extends YcCompanyGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<YcCompanyGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof YcCompanyGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], YcCompanyGroupByOutputType[P]>
            : GetScalarType<T[P], YcCompanyGroupByOutputType[P]>
        }
      >
    >


  export type YcCompanySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ycId?: boolean
    slug?: boolean
    name?: boolean
    batch?: boolean
    status?: boolean
    website?: boolean
    description?: boolean
    longDescription?: boolean
    teamSize?: boolean
    allLocations?: boolean
    industries?: boolean
    subverticals?: boolean
    tags?: boolean
    badges?: boolean
    foundersRaw?: boolean
    rawJson?: boolean
    organizationId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | YcCompany$organizationArgs<ExtArgs>
    ycPersons?: boolean | YcCompany$ycPersonsArgs<ExtArgs>
    _count?: boolean | YcCompanyCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["ycCompany"]>

  export type YcCompanySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ycId?: boolean
    slug?: boolean
    name?: boolean
    batch?: boolean
    status?: boolean
    website?: boolean
    description?: boolean
    longDescription?: boolean
    teamSize?: boolean
    allLocations?: boolean
    industries?: boolean
    subverticals?: boolean
    tags?: boolean
    badges?: boolean
    foundersRaw?: boolean
    rawJson?: boolean
    organizationId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    organization?: boolean | YcCompany$organizationArgs<ExtArgs>
  }, ExtArgs["result"]["ycCompany"]>

  export type YcCompanySelectScalar = {
    id?: boolean
    ycId?: boolean
    slug?: boolean
    name?: boolean
    batch?: boolean
    status?: boolean
    website?: boolean
    description?: boolean
    longDescription?: boolean
    teamSize?: boolean
    allLocations?: boolean
    industries?: boolean
    subverticals?: boolean
    tags?: boolean
    badges?: boolean
    foundersRaw?: boolean
    rawJson?: boolean
    organizationId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type YcCompanyInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | YcCompany$organizationArgs<ExtArgs>
    ycPersons?: boolean | YcCompany$ycPersonsArgs<ExtArgs>
    _count?: boolean | YcCompanyCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type YcCompanyIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | YcCompany$organizationArgs<ExtArgs>
  }

  export type $YcCompanyPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "YcCompany"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs> | null
      ycPersons: Prisma.$YcPersonPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      ycId: string
      slug: string
      name: string
      batch: string
      status: string | null
      website: string | null
      description: string | null
      longDescription: string | null
      teamSize: number | null
      allLocations: string | null
      industries: string[]
      subverticals: string[]
      tags: string[]
      badges: Prisma.JsonValue | null
      foundersRaw: Prisma.JsonValue | null
      rawJson: Prisma.JsonValue
      organizationId: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["ycCompany"]>
    composites: {}
  }

  type YcCompanyGetPayload<S extends boolean | null | undefined | YcCompanyDefaultArgs> = $Result.GetResult<Prisma.$YcCompanyPayload, S>

  type YcCompanyCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<YcCompanyFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: YcCompanyCountAggregateInputType | true
    }

  export interface YcCompanyDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['YcCompany'], meta: { name: 'YcCompany' } }
    /**
     * Find zero or one YcCompany that matches the filter.
     * @param {YcCompanyFindUniqueArgs} args - Arguments to find a YcCompany
     * @example
     * // Get one YcCompany
     * const ycCompany = await prisma.ycCompany.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends YcCompanyFindUniqueArgs>(args: SelectSubset<T, YcCompanyFindUniqueArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one YcCompany that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {YcCompanyFindUniqueOrThrowArgs} args - Arguments to find a YcCompany
     * @example
     * // Get one YcCompany
     * const ycCompany = await prisma.ycCompany.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends YcCompanyFindUniqueOrThrowArgs>(args: SelectSubset<T, YcCompanyFindUniqueOrThrowArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first YcCompany that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcCompanyFindFirstArgs} args - Arguments to find a YcCompany
     * @example
     * // Get one YcCompany
     * const ycCompany = await prisma.ycCompany.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends YcCompanyFindFirstArgs>(args?: SelectSubset<T, YcCompanyFindFirstArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first YcCompany that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcCompanyFindFirstOrThrowArgs} args - Arguments to find a YcCompany
     * @example
     * // Get one YcCompany
     * const ycCompany = await prisma.ycCompany.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends YcCompanyFindFirstOrThrowArgs>(args?: SelectSubset<T, YcCompanyFindFirstOrThrowArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more YcCompanies that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcCompanyFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all YcCompanies
     * const ycCompanies = await prisma.ycCompany.findMany()
     * 
     * // Get first 10 YcCompanies
     * const ycCompanies = await prisma.ycCompany.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const ycCompanyWithIdOnly = await prisma.ycCompany.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends YcCompanyFindManyArgs>(args?: SelectSubset<T, YcCompanyFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a YcCompany.
     * @param {YcCompanyCreateArgs} args - Arguments to create a YcCompany.
     * @example
     * // Create one YcCompany
     * const YcCompany = await prisma.ycCompany.create({
     *   data: {
     *     // ... data to create a YcCompany
     *   }
     * })
     * 
     */
    create<T extends YcCompanyCreateArgs>(args: SelectSubset<T, YcCompanyCreateArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many YcCompanies.
     * @param {YcCompanyCreateManyArgs} args - Arguments to create many YcCompanies.
     * @example
     * // Create many YcCompanies
     * const ycCompany = await prisma.ycCompany.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends YcCompanyCreateManyArgs>(args?: SelectSubset<T, YcCompanyCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many YcCompanies and returns the data saved in the database.
     * @param {YcCompanyCreateManyAndReturnArgs} args - Arguments to create many YcCompanies.
     * @example
     * // Create many YcCompanies
     * const ycCompany = await prisma.ycCompany.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many YcCompanies and only return the `id`
     * const ycCompanyWithIdOnly = await prisma.ycCompany.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends YcCompanyCreateManyAndReturnArgs>(args?: SelectSubset<T, YcCompanyCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a YcCompany.
     * @param {YcCompanyDeleteArgs} args - Arguments to delete one YcCompany.
     * @example
     * // Delete one YcCompany
     * const YcCompany = await prisma.ycCompany.delete({
     *   where: {
     *     // ... filter to delete one YcCompany
     *   }
     * })
     * 
     */
    delete<T extends YcCompanyDeleteArgs>(args: SelectSubset<T, YcCompanyDeleteArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one YcCompany.
     * @param {YcCompanyUpdateArgs} args - Arguments to update one YcCompany.
     * @example
     * // Update one YcCompany
     * const ycCompany = await prisma.ycCompany.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends YcCompanyUpdateArgs>(args: SelectSubset<T, YcCompanyUpdateArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more YcCompanies.
     * @param {YcCompanyDeleteManyArgs} args - Arguments to filter YcCompanies to delete.
     * @example
     * // Delete a few YcCompanies
     * const { count } = await prisma.ycCompany.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends YcCompanyDeleteManyArgs>(args?: SelectSubset<T, YcCompanyDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more YcCompanies.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcCompanyUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many YcCompanies
     * const ycCompany = await prisma.ycCompany.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends YcCompanyUpdateManyArgs>(args: SelectSubset<T, YcCompanyUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one YcCompany.
     * @param {YcCompanyUpsertArgs} args - Arguments to update or create a YcCompany.
     * @example
     * // Update or create a YcCompany
     * const ycCompany = await prisma.ycCompany.upsert({
     *   create: {
     *     // ... data to create a YcCompany
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the YcCompany we want to update
     *   }
     * })
     */
    upsert<T extends YcCompanyUpsertArgs>(args: SelectSubset<T, YcCompanyUpsertArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of YcCompanies.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcCompanyCountArgs} args - Arguments to filter YcCompanies to count.
     * @example
     * // Count the number of YcCompanies
     * const count = await prisma.ycCompany.count({
     *   where: {
     *     // ... the filter for the YcCompanies we want to count
     *   }
     * })
    **/
    count<T extends YcCompanyCountArgs>(
      args?: Subset<T, YcCompanyCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], YcCompanyCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a YcCompany.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcCompanyAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends YcCompanyAggregateArgs>(args: Subset<T, YcCompanyAggregateArgs>): Prisma.PrismaPromise<GetYcCompanyAggregateType<T>>

    /**
     * Group by YcCompany.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcCompanyGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends YcCompanyGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: YcCompanyGroupByArgs['orderBy'] }
        : { orderBy?: YcCompanyGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, YcCompanyGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetYcCompanyGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the YcCompany model
   */
  readonly fields: YcCompanyFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for YcCompany.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__YcCompanyClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends YcCompany$organizationArgs<ExtArgs> = {}>(args?: Subset<T, YcCompany$organizationArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    ycPersons<T extends YcCompany$ycPersonsArgs<ExtArgs> = {}>(args?: Subset<T, YcCompany$ycPersonsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the YcCompany model
   */ 
  interface YcCompanyFieldRefs {
    readonly id: FieldRef<"YcCompany", 'String'>
    readonly ycId: FieldRef<"YcCompany", 'String'>
    readonly slug: FieldRef<"YcCompany", 'String'>
    readonly name: FieldRef<"YcCompany", 'String'>
    readonly batch: FieldRef<"YcCompany", 'String'>
    readonly status: FieldRef<"YcCompany", 'String'>
    readonly website: FieldRef<"YcCompany", 'String'>
    readonly description: FieldRef<"YcCompany", 'String'>
    readonly longDescription: FieldRef<"YcCompany", 'String'>
    readonly teamSize: FieldRef<"YcCompany", 'Int'>
    readonly allLocations: FieldRef<"YcCompany", 'String'>
    readonly industries: FieldRef<"YcCompany", 'String[]'>
    readonly subverticals: FieldRef<"YcCompany", 'String[]'>
    readonly tags: FieldRef<"YcCompany", 'String[]'>
    readonly badges: FieldRef<"YcCompany", 'Json'>
    readonly foundersRaw: FieldRef<"YcCompany", 'Json'>
    readonly rawJson: FieldRef<"YcCompany", 'Json'>
    readonly organizationId: FieldRef<"YcCompany", 'String'>
    readonly createdAt: FieldRef<"YcCompany", 'DateTime'>
    readonly updatedAt: FieldRef<"YcCompany", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * YcCompany findUnique
   */
  export type YcCompanyFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * Filter, which YcCompany to fetch.
     */
    where: YcCompanyWhereUniqueInput
  }

  /**
   * YcCompany findUniqueOrThrow
   */
  export type YcCompanyFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * Filter, which YcCompany to fetch.
     */
    where: YcCompanyWhereUniqueInput
  }

  /**
   * YcCompany findFirst
   */
  export type YcCompanyFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * Filter, which YcCompany to fetch.
     */
    where?: YcCompanyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of YcCompanies to fetch.
     */
    orderBy?: YcCompanyOrderByWithRelationInput | YcCompanyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for YcCompanies.
     */
    cursor?: YcCompanyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` YcCompanies from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` YcCompanies.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of YcCompanies.
     */
    distinct?: YcCompanyScalarFieldEnum | YcCompanyScalarFieldEnum[]
  }

  /**
   * YcCompany findFirstOrThrow
   */
  export type YcCompanyFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * Filter, which YcCompany to fetch.
     */
    where?: YcCompanyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of YcCompanies to fetch.
     */
    orderBy?: YcCompanyOrderByWithRelationInput | YcCompanyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for YcCompanies.
     */
    cursor?: YcCompanyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` YcCompanies from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` YcCompanies.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of YcCompanies.
     */
    distinct?: YcCompanyScalarFieldEnum | YcCompanyScalarFieldEnum[]
  }

  /**
   * YcCompany findMany
   */
  export type YcCompanyFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * Filter, which YcCompanies to fetch.
     */
    where?: YcCompanyWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of YcCompanies to fetch.
     */
    orderBy?: YcCompanyOrderByWithRelationInput | YcCompanyOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing YcCompanies.
     */
    cursor?: YcCompanyWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` YcCompanies from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` YcCompanies.
     */
    skip?: number
    distinct?: YcCompanyScalarFieldEnum | YcCompanyScalarFieldEnum[]
  }

  /**
   * YcCompany create
   */
  export type YcCompanyCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * The data needed to create a YcCompany.
     */
    data: XOR<YcCompanyCreateInput, YcCompanyUncheckedCreateInput>
  }

  /**
   * YcCompany createMany
   */
  export type YcCompanyCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many YcCompanies.
     */
    data: YcCompanyCreateManyInput | YcCompanyCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * YcCompany createManyAndReturn
   */
  export type YcCompanyCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many YcCompanies.
     */
    data: YcCompanyCreateManyInput | YcCompanyCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * YcCompany update
   */
  export type YcCompanyUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * The data needed to update a YcCompany.
     */
    data: XOR<YcCompanyUpdateInput, YcCompanyUncheckedUpdateInput>
    /**
     * Choose, which YcCompany to update.
     */
    where: YcCompanyWhereUniqueInput
  }

  /**
   * YcCompany updateMany
   */
  export type YcCompanyUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update YcCompanies.
     */
    data: XOR<YcCompanyUpdateManyMutationInput, YcCompanyUncheckedUpdateManyInput>
    /**
     * Filter which YcCompanies to update
     */
    where?: YcCompanyWhereInput
  }

  /**
   * YcCompany upsert
   */
  export type YcCompanyUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * The filter to search for the YcCompany to update in case it exists.
     */
    where: YcCompanyWhereUniqueInput
    /**
     * In case the YcCompany found by the `where` argument doesn't exist, create a new YcCompany with this data.
     */
    create: XOR<YcCompanyCreateInput, YcCompanyUncheckedCreateInput>
    /**
     * In case the YcCompany was found with the provided `where` argument, update it with this data.
     */
    update: XOR<YcCompanyUpdateInput, YcCompanyUncheckedUpdateInput>
  }

  /**
   * YcCompany delete
   */
  export type YcCompanyDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    /**
     * Filter which YcCompany to delete.
     */
    where: YcCompanyWhereUniqueInput
  }

  /**
   * YcCompany deleteMany
   */
  export type YcCompanyDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which YcCompanies to delete
     */
    where?: YcCompanyWhereInput
  }

  /**
   * YcCompany.organization
   */
  export type YcCompany$organizationArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    where?: OrganizationWhereInput
  }

  /**
   * YcCompany.ycPersons
   */
  export type YcCompany$ycPersonsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    where?: YcPersonWhereInput
    orderBy?: YcPersonOrderByWithRelationInput | YcPersonOrderByWithRelationInput[]
    cursor?: YcPersonWhereUniqueInput
    take?: number
    skip?: number
    distinct?: YcPersonScalarFieldEnum | YcPersonScalarFieldEnum[]
  }

  /**
   * YcCompany without action
   */
  export type YcCompanyDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
  }


  /**
   * Model YcPerson
   */

  export type AggregateYcPerson = {
    _count: YcPersonCountAggregateOutputType | null
    _min: YcPersonMinAggregateOutputType | null
    _max: YcPersonMaxAggregateOutputType | null
  }

  export type YcPersonMinAggregateOutputType = {
    id: string | null
    ycId: string | null
    name: string | null
    role: string | null
    linkedinUrl: string | null
    twitterUrl: string | null
    avatarUrl: string | null
    bio: string | null
    ycCompanyId: string | null
    personId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type YcPersonMaxAggregateOutputType = {
    id: string | null
    ycId: string | null
    name: string | null
    role: string | null
    linkedinUrl: string | null
    twitterUrl: string | null
    avatarUrl: string | null
    bio: string | null
    ycCompanyId: string | null
    personId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type YcPersonCountAggregateOutputType = {
    id: number
    ycId: number
    name: number
    role: number
    linkedinUrl: number
    twitterUrl: number
    avatarUrl: number
    bio: number
    ycCompanyId: number
    personId: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type YcPersonMinAggregateInputType = {
    id?: true
    ycId?: true
    name?: true
    role?: true
    linkedinUrl?: true
    twitterUrl?: true
    avatarUrl?: true
    bio?: true
    ycCompanyId?: true
    personId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type YcPersonMaxAggregateInputType = {
    id?: true
    ycId?: true
    name?: true
    role?: true
    linkedinUrl?: true
    twitterUrl?: true
    avatarUrl?: true
    bio?: true
    ycCompanyId?: true
    personId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type YcPersonCountAggregateInputType = {
    id?: true
    ycId?: true
    name?: true
    role?: true
    linkedinUrl?: true
    twitterUrl?: true
    avatarUrl?: true
    bio?: true
    ycCompanyId?: true
    personId?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type YcPersonAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which YcPerson to aggregate.
     */
    where?: YcPersonWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of YcPeople to fetch.
     */
    orderBy?: YcPersonOrderByWithRelationInput | YcPersonOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: YcPersonWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` YcPeople from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` YcPeople.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned YcPeople
    **/
    _count?: true | YcPersonCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: YcPersonMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: YcPersonMaxAggregateInputType
  }

  export type GetYcPersonAggregateType<T extends YcPersonAggregateArgs> = {
        [P in keyof T & keyof AggregateYcPerson]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateYcPerson[P]>
      : GetScalarType<T[P], AggregateYcPerson[P]>
  }




  export type YcPersonGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: YcPersonWhereInput
    orderBy?: YcPersonOrderByWithAggregationInput | YcPersonOrderByWithAggregationInput[]
    by: YcPersonScalarFieldEnum[] | YcPersonScalarFieldEnum
    having?: YcPersonScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: YcPersonCountAggregateInputType | true
    _min?: YcPersonMinAggregateInputType
    _max?: YcPersonMaxAggregateInputType
  }

  export type YcPersonGroupByOutputType = {
    id: string
    ycId: string
    name: string
    role: string | null
    linkedinUrl: string | null
    twitterUrl: string | null
    avatarUrl: string | null
    bio: string | null
    ycCompanyId: string | null
    personId: string | null
    createdAt: Date
    updatedAt: Date
    _count: YcPersonCountAggregateOutputType | null
    _min: YcPersonMinAggregateOutputType | null
    _max: YcPersonMaxAggregateOutputType | null
  }

  type GetYcPersonGroupByPayload<T extends YcPersonGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<YcPersonGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof YcPersonGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], YcPersonGroupByOutputType[P]>
            : GetScalarType<T[P], YcPersonGroupByOutputType[P]>
        }
      >
    >


  export type YcPersonSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ycId?: boolean
    name?: boolean
    role?: boolean
    linkedinUrl?: boolean
    twitterUrl?: boolean
    avatarUrl?: boolean
    bio?: boolean
    ycCompanyId?: boolean
    personId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ycCompany?: boolean | YcPerson$ycCompanyArgs<ExtArgs>
    person?: boolean | YcPerson$personArgs<ExtArgs>
  }, ExtArgs["result"]["ycPerson"]>

  export type YcPersonSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ycId?: boolean
    name?: boolean
    role?: boolean
    linkedinUrl?: boolean
    twitterUrl?: boolean
    avatarUrl?: boolean
    bio?: boolean
    ycCompanyId?: boolean
    personId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ycCompany?: boolean | YcPerson$ycCompanyArgs<ExtArgs>
    person?: boolean | YcPerson$personArgs<ExtArgs>
  }, ExtArgs["result"]["ycPerson"]>

  export type YcPersonSelectScalar = {
    id?: boolean
    ycId?: boolean
    name?: boolean
    role?: boolean
    linkedinUrl?: boolean
    twitterUrl?: boolean
    avatarUrl?: boolean
    bio?: boolean
    ycCompanyId?: boolean
    personId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type YcPersonInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ycCompany?: boolean | YcPerson$ycCompanyArgs<ExtArgs>
    person?: boolean | YcPerson$personArgs<ExtArgs>
  }
  export type YcPersonIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ycCompany?: boolean | YcPerson$ycCompanyArgs<ExtArgs>
    person?: boolean | YcPerson$personArgs<ExtArgs>
  }

  export type $YcPersonPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "YcPerson"
    objects: {
      ycCompany: Prisma.$YcCompanyPayload<ExtArgs> | null
      person: Prisma.$PersonPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      ycId: string
      name: string
      role: string | null
      linkedinUrl: string | null
      twitterUrl: string | null
      avatarUrl: string | null
      bio: string | null
      ycCompanyId: string | null
      personId: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["ycPerson"]>
    composites: {}
  }

  type YcPersonGetPayload<S extends boolean | null | undefined | YcPersonDefaultArgs> = $Result.GetResult<Prisma.$YcPersonPayload, S>

  type YcPersonCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<YcPersonFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: YcPersonCountAggregateInputType | true
    }

  export interface YcPersonDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['YcPerson'], meta: { name: 'YcPerson' } }
    /**
     * Find zero or one YcPerson that matches the filter.
     * @param {YcPersonFindUniqueArgs} args - Arguments to find a YcPerson
     * @example
     * // Get one YcPerson
     * const ycPerson = await prisma.ycPerson.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends YcPersonFindUniqueArgs>(args: SelectSubset<T, YcPersonFindUniqueArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one YcPerson that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {YcPersonFindUniqueOrThrowArgs} args - Arguments to find a YcPerson
     * @example
     * // Get one YcPerson
     * const ycPerson = await prisma.ycPerson.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends YcPersonFindUniqueOrThrowArgs>(args: SelectSubset<T, YcPersonFindUniqueOrThrowArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first YcPerson that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcPersonFindFirstArgs} args - Arguments to find a YcPerson
     * @example
     * // Get one YcPerson
     * const ycPerson = await prisma.ycPerson.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends YcPersonFindFirstArgs>(args?: SelectSubset<T, YcPersonFindFirstArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first YcPerson that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcPersonFindFirstOrThrowArgs} args - Arguments to find a YcPerson
     * @example
     * // Get one YcPerson
     * const ycPerson = await prisma.ycPerson.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends YcPersonFindFirstOrThrowArgs>(args?: SelectSubset<T, YcPersonFindFirstOrThrowArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more YcPeople that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcPersonFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all YcPeople
     * const ycPeople = await prisma.ycPerson.findMany()
     * 
     * // Get first 10 YcPeople
     * const ycPeople = await prisma.ycPerson.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const ycPersonWithIdOnly = await prisma.ycPerson.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends YcPersonFindManyArgs>(args?: SelectSubset<T, YcPersonFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a YcPerson.
     * @param {YcPersonCreateArgs} args - Arguments to create a YcPerson.
     * @example
     * // Create one YcPerson
     * const YcPerson = await prisma.ycPerson.create({
     *   data: {
     *     // ... data to create a YcPerson
     *   }
     * })
     * 
     */
    create<T extends YcPersonCreateArgs>(args: SelectSubset<T, YcPersonCreateArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many YcPeople.
     * @param {YcPersonCreateManyArgs} args - Arguments to create many YcPeople.
     * @example
     * // Create many YcPeople
     * const ycPerson = await prisma.ycPerson.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends YcPersonCreateManyArgs>(args?: SelectSubset<T, YcPersonCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many YcPeople and returns the data saved in the database.
     * @param {YcPersonCreateManyAndReturnArgs} args - Arguments to create many YcPeople.
     * @example
     * // Create many YcPeople
     * const ycPerson = await prisma.ycPerson.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many YcPeople and only return the `id`
     * const ycPersonWithIdOnly = await prisma.ycPerson.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends YcPersonCreateManyAndReturnArgs>(args?: SelectSubset<T, YcPersonCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a YcPerson.
     * @param {YcPersonDeleteArgs} args - Arguments to delete one YcPerson.
     * @example
     * // Delete one YcPerson
     * const YcPerson = await prisma.ycPerson.delete({
     *   where: {
     *     // ... filter to delete one YcPerson
     *   }
     * })
     * 
     */
    delete<T extends YcPersonDeleteArgs>(args: SelectSubset<T, YcPersonDeleteArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one YcPerson.
     * @param {YcPersonUpdateArgs} args - Arguments to update one YcPerson.
     * @example
     * // Update one YcPerson
     * const ycPerson = await prisma.ycPerson.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends YcPersonUpdateArgs>(args: SelectSubset<T, YcPersonUpdateArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more YcPeople.
     * @param {YcPersonDeleteManyArgs} args - Arguments to filter YcPeople to delete.
     * @example
     * // Delete a few YcPeople
     * const { count } = await prisma.ycPerson.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends YcPersonDeleteManyArgs>(args?: SelectSubset<T, YcPersonDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more YcPeople.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcPersonUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many YcPeople
     * const ycPerson = await prisma.ycPerson.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends YcPersonUpdateManyArgs>(args: SelectSubset<T, YcPersonUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one YcPerson.
     * @param {YcPersonUpsertArgs} args - Arguments to update or create a YcPerson.
     * @example
     * // Update or create a YcPerson
     * const ycPerson = await prisma.ycPerson.upsert({
     *   create: {
     *     // ... data to create a YcPerson
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the YcPerson we want to update
     *   }
     * })
     */
    upsert<T extends YcPersonUpsertArgs>(args: SelectSubset<T, YcPersonUpsertArgs<ExtArgs>>): Prisma__YcPersonClient<$Result.GetResult<Prisma.$YcPersonPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of YcPeople.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcPersonCountArgs} args - Arguments to filter YcPeople to count.
     * @example
     * // Count the number of YcPeople
     * const count = await prisma.ycPerson.count({
     *   where: {
     *     // ... the filter for the YcPeople we want to count
     *   }
     * })
    **/
    count<T extends YcPersonCountArgs>(
      args?: Subset<T, YcPersonCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], YcPersonCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a YcPerson.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcPersonAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends YcPersonAggregateArgs>(args: Subset<T, YcPersonAggregateArgs>): Prisma.PrismaPromise<GetYcPersonAggregateType<T>>

    /**
     * Group by YcPerson.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {YcPersonGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends YcPersonGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: YcPersonGroupByArgs['orderBy'] }
        : { orderBy?: YcPersonGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, YcPersonGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetYcPersonGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the YcPerson model
   */
  readonly fields: YcPersonFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for YcPerson.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__YcPersonClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    ycCompany<T extends YcPerson$ycCompanyArgs<ExtArgs> = {}>(args?: Subset<T, YcPerson$ycCompanyArgs<ExtArgs>>): Prisma__YcCompanyClient<$Result.GetResult<Prisma.$YcCompanyPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    person<T extends YcPerson$personArgs<ExtArgs> = {}>(args?: Subset<T, YcPerson$personArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the YcPerson model
   */ 
  interface YcPersonFieldRefs {
    readonly id: FieldRef<"YcPerson", 'String'>
    readonly ycId: FieldRef<"YcPerson", 'String'>
    readonly name: FieldRef<"YcPerson", 'String'>
    readonly role: FieldRef<"YcPerson", 'String'>
    readonly linkedinUrl: FieldRef<"YcPerson", 'String'>
    readonly twitterUrl: FieldRef<"YcPerson", 'String'>
    readonly avatarUrl: FieldRef<"YcPerson", 'String'>
    readonly bio: FieldRef<"YcPerson", 'String'>
    readonly ycCompanyId: FieldRef<"YcPerson", 'String'>
    readonly personId: FieldRef<"YcPerson", 'String'>
    readonly createdAt: FieldRef<"YcPerson", 'DateTime'>
    readonly updatedAt: FieldRef<"YcPerson", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * YcPerson findUnique
   */
  export type YcPersonFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * Filter, which YcPerson to fetch.
     */
    where: YcPersonWhereUniqueInput
  }

  /**
   * YcPerson findUniqueOrThrow
   */
  export type YcPersonFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * Filter, which YcPerson to fetch.
     */
    where: YcPersonWhereUniqueInput
  }

  /**
   * YcPerson findFirst
   */
  export type YcPersonFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * Filter, which YcPerson to fetch.
     */
    where?: YcPersonWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of YcPeople to fetch.
     */
    orderBy?: YcPersonOrderByWithRelationInput | YcPersonOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for YcPeople.
     */
    cursor?: YcPersonWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` YcPeople from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` YcPeople.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of YcPeople.
     */
    distinct?: YcPersonScalarFieldEnum | YcPersonScalarFieldEnum[]
  }

  /**
   * YcPerson findFirstOrThrow
   */
  export type YcPersonFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * Filter, which YcPerson to fetch.
     */
    where?: YcPersonWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of YcPeople to fetch.
     */
    orderBy?: YcPersonOrderByWithRelationInput | YcPersonOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for YcPeople.
     */
    cursor?: YcPersonWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` YcPeople from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` YcPeople.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of YcPeople.
     */
    distinct?: YcPersonScalarFieldEnum | YcPersonScalarFieldEnum[]
  }

  /**
   * YcPerson findMany
   */
  export type YcPersonFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * Filter, which YcPeople to fetch.
     */
    where?: YcPersonWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of YcPeople to fetch.
     */
    orderBy?: YcPersonOrderByWithRelationInput | YcPersonOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing YcPeople.
     */
    cursor?: YcPersonWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` YcPeople from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` YcPeople.
     */
    skip?: number
    distinct?: YcPersonScalarFieldEnum | YcPersonScalarFieldEnum[]
  }

  /**
   * YcPerson create
   */
  export type YcPersonCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * The data needed to create a YcPerson.
     */
    data: XOR<YcPersonCreateInput, YcPersonUncheckedCreateInput>
  }

  /**
   * YcPerson createMany
   */
  export type YcPersonCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many YcPeople.
     */
    data: YcPersonCreateManyInput | YcPersonCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * YcPerson createManyAndReturn
   */
  export type YcPersonCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many YcPeople.
     */
    data: YcPersonCreateManyInput | YcPersonCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * YcPerson update
   */
  export type YcPersonUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * The data needed to update a YcPerson.
     */
    data: XOR<YcPersonUpdateInput, YcPersonUncheckedUpdateInput>
    /**
     * Choose, which YcPerson to update.
     */
    where: YcPersonWhereUniqueInput
  }

  /**
   * YcPerson updateMany
   */
  export type YcPersonUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update YcPeople.
     */
    data: XOR<YcPersonUpdateManyMutationInput, YcPersonUncheckedUpdateManyInput>
    /**
     * Filter which YcPeople to update
     */
    where?: YcPersonWhereInput
  }

  /**
   * YcPerson upsert
   */
  export type YcPersonUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * The filter to search for the YcPerson to update in case it exists.
     */
    where: YcPersonWhereUniqueInput
    /**
     * In case the YcPerson found by the `where` argument doesn't exist, create a new YcPerson with this data.
     */
    create: XOR<YcPersonCreateInput, YcPersonUncheckedCreateInput>
    /**
     * In case the YcPerson was found with the provided `where` argument, update it with this data.
     */
    update: XOR<YcPersonUpdateInput, YcPersonUncheckedUpdateInput>
  }

  /**
   * YcPerson delete
   */
  export type YcPersonDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
    /**
     * Filter which YcPerson to delete.
     */
    where: YcPersonWhereUniqueInput
  }

  /**
   * YcPerson deleteMany
   */
  export type YcPersonDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which YcPeople to delete
     */
    where?: YcPersonWhereInput
  }

  /**
   * YcPerson.ycCompany
   */
  export type YcPerson$ycCompanyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcCompany
     */
    select?: YcCompanySelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcCompanyInclude<ExtArgs> | null
    where?: YcCompanyWhereInput
  }

  /**
   * YcPerson.person
   */
  export type YcPerson$personArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    where?: PersonWhereInput
  }

  /**
   * YcPerson without action
   */
  export type YcPersonDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the YcPerson
     */
    select?: YcPersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: YcPersonInclude<ExtArgs> | null
  }


  /**
   * Model MatchDecision
   */

  export type AggregateMatchDecision = {
    _count: MatchDecisionCountAggregateOutputType | null
    _avg: MatchDecisionAvgAggregateOutputType | null
    _sum: MatchDecisionSumAggregateOutputType | null
    _min: MatchDecisionMinAggregateOutputType | null
    _max: MatchDecisionMaxAggregateOutputType | null
  }

  export type MatchDecisionAvgAggregateOutputType = {
    confidenceScore: number | null
  }

  export type MatchDecisionSumAggregateOutputType = {
    confidenceScore: number | null
  }

  export type MatchDecisionMinAggregateOutputType = {
    id: string | null
    entityType: string | null
    selectedId: string | null
    matchRuleUsed: string | null
    confidenceScore: number | null
    decisionType: string | null
    resolverVersion: string | null
    organizationId: string | null
    personId: string | null
    createdAt: Date | null
  }

  export type MatchDecisionMaxAggregateOutputType = {
    id: string | null
    entityType: string | null
    selectedId: string | null
    matchRuleUsed: string | null
    confidenceScore: number | null
    decisionType: string | null
    resolverVersion: string | null
    organizationId: string | null
    personId: string | null
    createdAt: Date | null
  }

  export type MatchDecisionCountAggregateOutputType = {
    id: number
    entityType: number
    candidateIds: number
    selectedId: number
    matchRuleUsed: number
    confidenceScore: number
    decisionType: number
    resolverVersion: number
    metadata: number
    organizationId: number
    personId: number
    createdAt: number
    _all: number
  }


  export type MatchDecisionAvgAggregateInputType = {
    confidenceScore?: true
  }

  export type MatchDecisionSumAggregateInputType = {
    confidenceScore?: true
  }

  export type MatchDecisionMinAggregateInputType = {
    id?: true
    entityType?: true
    selectedId?: true
    matchRuleUsed?: true
    confidenceScore?: true
    decisionType?: true
    resolverVersion?: true
    organizationId?: true
    personId?: true
    createdAt?: true
  }

  export type MatchDecisionMaxAggregateInputType = {
    id?: true
    entityType?: true
    selectedId?: true
    matchRuleUsed?: true
    confidenceScore?: true
    decisionType?: true
    resolverVersion?: true
    organizationId?: true
    personId?: true
    createdAt?: true
  }

  export type MatchDecisionCountAggregateInputType = {
    id?: true
    entityType?: true
    candidateIds?: true
    selectedId?: true
    matchRuleUsed?: true
    confidenceScore?: true
    decisionType?: true
    resolverVersion?: true
    metadata?: true
    organizationId?: true
    personId?: true
    createdAt?: true
    _all?: true
  }

  export type MatchDecisionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which MatchDecision to aggregate.
     */
    where?: MatchDecisionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MatchDecisions to fetch.
     */
    orderBy?: MatchDecisionOrderByWithRelationInput | MatchDecisionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: MatchDecisionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MatchDecisions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MatchDecisions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned MatchDecisions
    **/
    _count?: true | MatchDecisionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: MatchDecisionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: MatchDecisionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: MatchDecisionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: MatchDecisionMaxAggregateInputType
  }

  export type GetMatchDecisionAggregateType<T extends MatchDecisionAggregateArgs> = {
        [P in keyof T & keyof AggregateMatchDecision]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateMatchDecision[P]>
      : GetScalarType<T[P], AggregateMatchDecision[P]>
  }




  export type MatchDecisionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchDecisionWhereInput
    orderBy?: MatchDecisionOrderByWithAggregationInput | MatchDecisionOrderByWithAggregationInput[]
    by: MatchDecisionScalarFieldEnum[] | MatchDecisionScalarFieldEnum
    having?: MatchDecisionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: MatchDecisionCountAggregateInputType | true
    _avg?: MatchDecisionAvgAggregateInputType
    _sum?: MatchDecisionSumAggregateInputType
    _min?: MatchDecisionMinAggregateInputType
    _max?: MatchDecisionMaxAggregateInputType
  }

  export type MatchDecisionGroupByOutputType = {
    id: string
    entityType: string
    candidateIds: string[]
    selectedId: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata: JsonValue | null
    organizationId: string | null
    personId: string | null
    createdAt: Date
    _count: MatchDecisionCountAggregateOutputType | null
    _avg: MatchDecisionAvgAggregateOutputType | null
    _sum: MatchDecisionSumAggregateOutputType | null
    _min: MatchDecisionMinAggregateOutputType | null
    _max: MatchDecisionMaxAggregateOutputType | null
  }

  type GetMatchDecisionGroupByPayload<T extends MatchDecisionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<MatchDecisionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof MatchDecisionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], MatchDecisionGroupByOutputType[P]>
            : GetScalarType<T[P], MatchDecisionGroupByOutputType[P]>
        }
      >
    >


  export type MatchDecisionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    entityType?: boolean
    candidateIds?: boolean
    selectedId?: boolean
    matchRuleUsed?: boolean
    confidenceScore?: boolean
    decisionType?: boolean
    resolverVersion?: boolean
    metadata?: boolean
    organizationId?: boolean
    personId?: boolean
    createdAt?: boolean
    organization?: boolean | MatchDecision$organizationArgs<ExtArgs>
    person?: boolean | MatchDecision$personArgs<ExtArgs>
  }, ExtArgs["result"]["matchDecision"]>

  export type MatchDecisionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    entityType?: boolean
    candidateIds?: boolean
    selectedId?: boolean
    matchRuleUsed?: boolean
    confidenceScore?: boolean
    decisionType?: boolean
    resolverVersion?: boolean
    metadata?: boolean
    organizationId?: boolean
    personId?: boolean
    createdAt?: boolean
    organization?: boolean | MatchDecision$organizationArgs<ExtArgs>
    person?: boolean | MatchDecision$personArgs<ExtArgs>
  }, ExtArgs["result"]["matchDecision"]>

  export type MatchDecisionSelectScalar = {
    id?: boolean
    entityType?: boolean
    candidateIds?: boolean
    selectedId?: boolean
    matchRuleUsed?: boolean
    confidenceScore?: boolean
    decisionType?: boolean
    resolverVersion?: boolean
    metadata?: boolean
    organizationId?: boolean
    personId?: boolean
    createdAt?: boolean
  }

  export type MatchDecisionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | MatchDecision$organizationArgs<ExtArgs>
    person?: boolean | MatchDecision$personArgs<ExtArgs>
  }
  export type MatchDecisionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | MatchDecision$organizationArgs<ExtArgs>
    person?: boolean | MatchDecision$personArgs<ExtArgs>
  }

  export type $MatchDecisionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "MatchDecision"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs> | null
      person: Prisma.$PersonPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      entityType: string
      candidateIds: string[]
      selectedId: string | null
      matchRuleUsed: string
      confidenceScore: number
      decisionType: string
      resolverVersion: string
      metadata: Prisma.JsonValue | null
      organizationId: string | null
      personId: string | null
      createdAt: Date
    }, ExtArgs["result"]["matchDecision"]>
    composites: {}
  }

  type MatchDecisionGetPayload<S extends boolean | null | undefined | MatchDecisionDefaultArgs> = $Result.GetResult<Prisma.$MatchDecisionPayload, S>

  type MatchDecisionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<MatchDecisionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: MatchDecisionCountAggregateInputType | true
    }

  export interface MatchDecisionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['MatchDecision'], meta: { name: 'MatchDecision' } }
    /**
     * Find zero or one MatchDecision that matches the filter.
     * @param {MatchDecisionFindUniqueArgs} args - Arguments to find a MatchDecision
     * @example
     * // Get one MatchDecision
     * const matchDecision = await prisma.matchDecision.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends MatchDecisionFindUniqueArgs>(args: SelectSubset<T, MatchDecisionFindUniqueArgs<ExtArgs>>): Prisma__MatchDecisionClient<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one MatchDecision that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {MatchDecisionFindUniqueOrThrowArgs} args - Arguments to find a MatchDecision
     * @example
     * // Get one MatchDecision
     * const matchDecision = await prisma.matchDecision.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends MatchDecisionFindUniqueOrThrowArgs>(args: SelectSubset<T, MatchDecisionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__MatchDecisionClient<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first MatchDecision that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchDecisionFindFirstArgs} args - Arguments to find a MatchDecision
     * @example
     * // Get one MatchDecision
     * const matchDecision = await prisma.matchDecision.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends MatchDecisionFindFirstArgs>(args?: SelectSubset<T, MatchDecisionFindFirstArgs<ExtArgs>>): Prisma__MatchDecisionClient<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first MatchDecision that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchDecisionFindFirstOrThrowArgs} args - Arguments to find a MatchDecision
     * @example
     * // Get one MatchDecision
     * const matchDecision = await prisma.matchDecision.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends MatchDecisionFindFirstOrThrowArgs>(args?: SelectSubset<T, MatchDecisionFindFirstOrThrowArgs<ExtArgs>>): Prisma__MatchDecisionClient<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more MatchDecisions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchDecisionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all MatchDecisions
     * const matchDecisions = await prisma.matchDecision.findMany()
     * 
     * // Get first 10 MatchDecisions
     * const matchDecisions = await prisma.matchDecision.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const matchDecisionWithIdOnly = await prisma.matchDecision.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends MatchDecisionFindManyArgs>(args?: SelectSubset<T, MatchDecisionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a MatchDecision.
     * @param {MatchDecisionCreateArgs} args - Arguments to create a MatchDecision.
     * @example
     * // Create one MatchDecision
     * const MatchDecision = await prisma.matchDecision.create({
     *   data: {
     *     // ... data to create a MatchDecision
     *   }
     * })
     * 
     */
    create<T extends MatchDecisionCreateArgs>(args: SelectSubset<T, MatchDecisionCreateArgs<ExtArgs>>): Prisma__MatchDecisionClient<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many MatchDecisions.
     * @param {MatchDecisionCreateManyArgs} args - Arguments to create many MatchDecisions.
     * @example
     * // Create many MatchDecisions
     * const matchDecision = await prisma.matchDecision.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends MatchDecisionCreateManyArgs>(args?: SelectSubset<T, MatchDecisionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many MatchDecisions and returns the data saved in the database.
     * @param {MatchDecisionCreateManyAndReturnArgs} args - Arguments to create many MatchDecisions.
     * @example
     * // Create many MatchDecisions
     * const matchDecision = await prisma.matchDecision.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many MatchDecisions and only return the `id`
     * const matchDecisionWithIdOnly = await prisma.matchDecision.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends MatchDecisionCreateManyAndReturnArgs>(args?: SelectSubset<T, MatchDecisionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a MatchDecision.
     * @param {MatchDecisionDeleteArgs} args - Arguments to delete one MatchDecision.
     * @example
     * // Delete one MatchDecision
     * const MatchDecision = await prisma.matchDecision.delete({
     *   where: {
     *     // ... filter to delete one MatchDecision
     *   }
     * })
     * 
     */
    delete<T extends MatchDecisionDeleteArgs>(args: SelectSubset<T, MatchDecisionDeleteArgs<ExtArgs>>): Prisma__MatchDecisionClient<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one MatchDecision.
     * @param {MatchDecisionUpdateArgs} args - Arguments to update one MatchDecision.
     * @example
     * // Update one MatchDecision
     * const matchDecision = await prisma.matchDecision.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends MatchDecisionUpdateArgs>(args: SelectSubset<T, MatchDecisionUpdateArgs<ExtArgs>>): Prisma__MatchDecisionClient<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more MatchDecisions.
     * @param {MatchDecisionDeleteManyArgs} args - Arguments to filter MatchDecisions to delete.
     * @example
     * // Delete a few MatchDecisions
     * const { count } = await prisma.matchDecision.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends MatchDecisionDeleteManyArgs>(args?: SelectSubset<T, MatchDecisionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more MatchDecisions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchDecisionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many MatchDecisions
     * const matchDecision = await prisma.matchDecision.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends MatchDecisionUpdateManyArgs>(args: SelectSubset<T, MatchDecisionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one MatchDecision.
     * @param {MatchDecisionUpsertArgs} args - Arguments to update or create a MatchDecision.
     * @example
     * // Update or create a MatchDecision
     * const matchDecision = await prisma.matchDecision.upsert({
     *   create: {
     *     // ... data to create a MatchDecision
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the MatchDecision we want to update
     *   }
     * })
     */
    upsert<T extends MatchDecisionUpsertArgs>(args: SelectSubset<T, MatchDecisionUpsertArgs<ExtArgs>>): Prisma__MatchDecisionClient<$Result.GetResult<Prisma.$MatchDecisionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of MatchDecisions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchDecisionCountArgs} args - Arguments to filter MatchDecisions to count.
     * @example
     * // Count the number of MatchDecisions
     * const count = await prisma.matchDecision.count({
     *   where: {
     *     // ... the filter for the MatchDecisions we want to count
     *   }
     * })
    **/
    count<T extends MatchDecisionCountArgs>(
      args?: Subset<T, MatchDecisionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], MatchDecisionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a MatchDecision.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchDecisionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends MatchDecisionAggregateArgs>(args: Subset<T, MatchDecisionAggregateArgs>): Prisma.PrismaPromise<GetMatchDecisionAggregateType<T>>

    /**
     * Group by MatchDecision.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchDecisionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends MatchDecisionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: MatchDecisionGroupByArgs['orderBy'] }
        : { orderBy?: MatchDecisionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, MatchDecisionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetMatchDecisionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the MatchDecision model
   */
  readonly fields: MatchDecisionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for MatchDecision.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__MatchDecisionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends MatchDecision$organizationArgs<ExtArgs> = {}>(args?: Subset<T, MatchDecision$organizationArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    person<T extends MatchDecision$personArgs<ExtArgs> = {}>(args?: Subset<T, MatchDecision$personArgs<ExtArgs>>): Prisma__PersonClient<$Result.GetResult<Prisma.$PersonPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the MatchDecision model
   */ 
  interface MatchDecisionFieldRefs {
    readonly id: FieldRef<"MatchDecision", 'String'>
    readonly entityType: FieldRef<"MatchDecision", 'String'>
    readonly candidateIds: FieldRef<"MatchDecision", 'String[]'>
    readonly selectedId: FieldRef<"MatchDecision", 'String'>
    readonly matchRuleUsed: FieldRef<"MatchDecision", 'String'>
    readonly confidenceScore: FieldRef<"MatchDecision", 'Float'>
    readonly decisionType: FieldRef<"MatchDecision", 'String'>
    readonly resolverVersion: FieldRef<"MatchDecision", 'String'>
    readonly metadata: FieldRef<"MatchDecision", 'Json'>
    readonly organizationId: FieldRef<"MatchDecision", 'String'>
    readonly personId: FieldRef<"MatchDecision", 'String'>
    readonly createdAt: FieldRef<"MatchDecision", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * MatchDecision findUnique
   */
  export type MatchDecisionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * Filter, which MatchDecision to fetch.
     */
    where: MatchDecisionWhereUniqueInput
  }

  /**
   * MatchDecision findUniqueOrThrow
   */
  export type MatchDecisionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * Filter, which MatchDecision to fetch.
     */
    where: MatchDecisionWhereUniqueInput
  }

  /**
   * MatchDecision findFirst
   */
  export type MatchDecisionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * Filter, which MatchDecision to fetch.
     */
    where?: MatchDecisionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MatchDecisions to fetch.
     */
    orderBy?: MatchDecisionOrderByWithRelationInput | MatchDecisionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for MatchDecisions.
     */
    cursor?: MatchDecisionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MatchDecisions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MatchDecisions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of MatchDecisions.
     */
    distinct?: MatchDecisionScalarFieldEnum | MatchDecisionScalarFieldEnum[]
  }

  /**
   * MatchDecision findFirstOrThrow
   */
  export type MatchDecisionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * Filter, which MatchDecision to fetch.
     */
    where?: MatchDecisionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MatchDecisions to fetch.
     */
    orderBy?: MatchDecisionOrderByWithRelationInput | MatchDecisionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for MatchDecisions.
     */
    cursor?: MatchDecisionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MatchDecisions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MatchDecisions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of MatchDecisions.
     */
    distinct?: MatchDecisionScalarFieldEnum | MatchDecisionScalarFieldEnum[]
  }

  /**
   * MatchDecision findMany
   */
  export type MatchDecisionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * Filter, which MatchDecisions to fetch.
     */
    where?: MatchDecisionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MatchDecisions to fetch.
     */
    orderBy?: MatchDecisionOrderByWithRelationInput | MatchDecisionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing MatchDecisions.
     */
    cursor?: MatchDecisionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MatchDecisions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MatchDecisions.
     */
    skip?: number
    distinct?: MatchDecisionScalarFieldEnum | MatchDecisionScalarFieldEnum[]
  }

  /**
   * MatchDecision create
   */
  export type MatchDecisionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * The data needed to create a MatchDecision.
     */
    data: XOR<MatchDecisionCreateInput, MatchDecisionUncheckedCreateInput>
  }

  /**
   * MatchDecision createMany
   */
  export type MatchDecisionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many MatchDecisions.
     */
    data: MatchDecisionCreateManyInput | MatchDecisionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * MatchDecision createManyAndReturn
   */
  export type MatchDecisionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many MatchDecisions.
     */
    data: MatchDecisionCreateManyInput | MatchDecisionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * MatchDecision update
   */
  export type MatchDecisionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * The data needed to update a MatchDecision.
     */
    data: XOR<MatchDecisionUpdateInput, MatchDecisionUncheckedUpdateInput>
    /**
     * Choose, which MatchDecision to update.
     */
    where: MatchDecisionWhereUniqueInput
  }

  /**
   * MatchDecision updateMany
   */
  export type MatchDecisionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update MatchDecisions.
     */
    data: XOR<MatchDecisionUpdateManyMutationInput, MatchDecisionUncheckedUpdateManyInput>
    /**
     * Filter which MatchDecisions to update
     */
    where?: MatchDecisionWhereInput
  }

  /**
   * MatchDecision upsert
   */
  export type MatchDecisionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * The filter to search for the MatchDecision to update in case it exists.
     */
    where: MatchDecisionWhereUniqueInput
    /**
     * In case the MatchDecision found by the `where` argument doesn't exist, create a new MatchDecision with this data.
     */
    create: XOR<MatchDecisionCreateInput, MatchDecisionUncheckedCreateInput>
    /**
     * In case the MatchDecision was found with the provided `where` argument, update it with this data.
     */
    update: XOR<MatchDecisionUpdateInput, MatchDecisionUncheckedUpdateInput>
  }

  /**
   * MatchDecision delete
   */
  export type MatchDecisionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
    /**
     * Filter which MatchDecision to delete.
     */
    where: MatchDecisionWhereUniqueInput
  }

  /**
   * MatchDecision deleteMany
   */
  export type MatchDecisionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which MatchDecisions to delete
     */
    where?: MatchDecisionWhereInput
  }

  /**
   * MatchDecision.organization
   */
  export type MatchDecision$organizationArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    where?: OrganizationWhereInput
  }

  /**
   * MatchDecision.person
   */
  export type MatchDecision$personArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Person
     */
    select?: PersonSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PersonInclude<ExtArgs> | null
    where?: PersonWhereInput
  }

  /**
   * MatchDecision without action
   */
  export type MatchDecisionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchDecision
     */
    select?: MatchDecisionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchDecisionInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const OrganizationScalarFieldEnum: {
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

  export type OrganizationScalarFieldEnum = (typeof OrganizationScalarFieldEnum)[keyof typeof OrganizationScalarFieldEnum]


  export const PersonScalarFieldEnum: {
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

  export type PersonScalarFieldEnum = (typeof PersonScalarFieldEnum)[keyof typeof PersonScalarFieldEnum]


  export const RoleScalarFieldEnum: {
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

  export type RoleScalarFieldEnum = (typeof RoleScalarFieldEnum)[keyof typeof RoleScalarFieldEnum]


  export const SourceRecordScalarFieldEnum: {
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

  export type SourceRecordScalarFieldEnum = (typeof SourceRecordScalarFieldEnum)[keyof typeof SourceRecordScalarFieldEnum]


  export const IngestionJobScalarFieldEnum: {
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

  export type IngestionJobScalarFieldEnum = (typeof IngestionJobScalarFieldEnum)[keyof typeof IngestionJobScalarFieldEnum]


  export const YcCompanyScalarFieldEnum: {
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

  export type YcCompanyScalarFieldEnum = (typeof YcCompanyScalarFieldEnum)[keyof typeof YcCompanyScalarFieldEnum]


  export const YcPersonScalarFieldEnum: {
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

  export type YcPersonScalarFieldEnum = (typeof YcPersonScalarFieldEnum)[keyof typeof YcPersonScalarFieldEnum]


  export const MatchDecisionScalarFieldEnum: {
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

  export type MatchDecisionScalarFieldEnum = (typeof MatchDecisionScalarFieldEnum)[keyof typeof MatchDecisionScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type OrganizationWhereInput = {
    AND?: OrganizationWhereInput | OrganizationWhereInput[]
    OR?: OrganizationWhereInput[]
    NOT?: OrganizationWhereInput | OrganizationWhereInput[]
    id?: StringFilter<"Organization"> | string
    canonicalName?: StringFilter<"Organization"> | string
    dedupeKey?: StringFilter<"Organization"> | string
    domain?: StringNullableFilter<"Organization"> | string | null
    website?: StringNullableFilter<"Organization"> | string | null
    linkedinUrl?: StringNullableFilter<"Organization"> | string | null
    description?: StringNullableFilter<"Organization"> | string | null
    logoUrl?: StringNullableFilter<"Organization"> | string | null
    industry?: StringNullableFilter<"Organization"> | string | null
    location?: StringNullableFilter<"Organization"> | string | null
    city?: StringNullableFilter<"Organization"> | string | null
    state?: StringNullableFilter<"Organization"> | string | null
    country?: StringNullableFilter<"Organization"> | string | null
    foundedYear?: IntNullableFilter<"Organization"> | number | null
    employeeCount?: IntNullableFilter<"Organization"> | number | null
    status?: StringNullableFilter<"Organization"> | string | null
    stageProxy?: StringNullableFilter<"Organization"> | string | null
    tags?: StringNullableListFilter<"Organization">
    isYcBacked?: BoolFilter<"Organization"> | boolean
    ycBatch?: StringNullableFilter<"Organization"> | string | null
    ycId?: StringNullableFilter<"Organization"> | string | null
    ycRawJson?: JsonNullableFilter<"Organization">
    sourceIds?: StringNullableListFilter<"Organization">
    createdAt?: DateTimeFilter<"Organization"> | Date | string
    updatedAt?: DateTimeFilter<"Organization"> | Date | string
    roles?: RoleListRelationFilter
    sourceRecords?: SourceRecordListRelationFilter
    matchDecisions?: MatchDecisionListRelationFilter
    ycCompany?: XOR<YcCompanyNullableRelationFilter, YcCompanyWhereInput> | null
  }

  export type OrganizationOrderByWithRelationInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    domain?: SortOrderInput | SortOrder
    website?: SortOrderInput | SortOrder
    linkedinUrl?: SortOrderInput | SortOrder
    description?: SortOrderInput | SortOrder
    logoUrl?: SortOrderInput | SortOrder
    industry?: SortOrderInput | SortOrder
    location?: SortOrderInput | SortOrder
    city?: SortOrderInput | SortOrder
    state?: SortOrderInput | SortOrder
    country?: SortOrderInput | SortOrder
    foundedYear?: SortOrderInput | SortOrder
    employeeCount?: SortOrderInput | SortOrder
    status?: SortOrderInput | SortOrder
    stageProxy?: SortOrderInput | SortOrder
    tags?: SortOrder
    isYcBacked?: SortOrder
    ycBatch?: SortOrderInput | SortOrder
    ycId?: SortOrderInput | SortOrder
    ycRawJson?: SortOrderInput | SortOrder
    sourceIds?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    roles?: RoleOrderByRelationAggregateInput
    sourceRecords?: SourceRecordOrderByRelationAggregateInput
    matchDecisions?: MatchDecisionOrderByRelationAggregateInput
    ycCompany?: YcCompanyOrderByWithRelationInput
  }

  export type OrganizationWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    dedupeKey?: string
    domain?: string
    ycId?: string
    AND?: OrganizationWhereInput | OrganizationWhereInput[]
    OR?: OrganizationWhereInput[]
    NOT?: OrganizationWhereInput | OrganizationWhereInput[]
    canonicalName?: StringFilter<"Organization"> | string
    website?: StringNullableFilter<"Organization"> | string | null
    linkedinUrl?: StringNullableFilter<"Organization"> | string | null
    description?: StringNullableFilter<"Organization"> | string | null
    logoUrl?: StringNullableFilter<"Organization"> | string | null
    industry?: StringNullableFilter<"Organization"> | string | null
    location?: StringNullableFilter<"Organization"> | string | null
    city?: StringNullableFilter<"Organization"> | string | null
    state?: StringNullableFilter<"Organization"> | string | null
    country?: StringNullableFilter<"Organization"> | string | null
    foundedYear?: IntNullableFilter<"Organization"> | number | null
    employeeCount?: IntNullableFilter<"Organization"> | number | null
    status?: StringNullableFilter<"Organization"> | string | null
    stageProxy?: StringNullableFilter<"Organization"> | string | null
    tags?: StringNullableListFilter<"Organization">
    isYcBacked?: BoolFilter<"Organization"> | boolean
    ycBatch?: StringNullableFilter<"Organization"> | string | null
    ycRawJson?: JsonNullableFilter<"Organization">
    sourceIds?: StringNullableListFilter<"Organization">
    createdAt?: DateTimeFilter<"Organization"> | Date | string
    updatedAt?: DateTimeFilter<"Organization"> | Date | string
    roles?: RoleListRelationFilter
    sourceRecords?: SourceRecordListRelationFilter
    matchDecisions?: MatchDecisionListRelationFilter
    ycCompany?: XOR<YcCompanyNullableRelationFilter, YcCompanyWhereInput> | null
  }, "id" | "dedupeKey" | "domain" | "ycId">

  export type OrganizationOrderByWithAggregationInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    domain?: SortOrderInput | SortOrder
    website?: SortOrderInput | SortOrder
    linkedinUrl?: SortOrderInput | SortOrder
    description?: SortOrderInput | SortOrder
    logoUrl?: SortOrderInput | SortOrder
    industry?: SortOrderInput | SortOrder
    location?: SortOrderInput | SortOrder
    city?: SortOrderInput | SortOrder
    state?: SortOrderInput | SortOrder
    country?: SortOrderInput | SortOrder
    foundedYear?: SortOrderInput | SortOrder
    employeeCount?: SortOrderInput | SortOrder
    status?: SortOrderInput | SortOrder
    stageProxy?: SortOrderInput | SortOrder
    tags?: SortOrder
    isYcBacked?: SortOrder
    ycBatch?: SortOrderInput | SortOrder
    ycId?: SortOrderInput | SortOrder
    ycRawJson?: SortOrderInput | SortOrder
    sourceIds?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: OrganizationCountOrderByAggregateInput
    _avg?: OrganizationAvgOrderByAggregateInput
    _max?: OrganizationMaxOrderByAggregateInput
    _min?: OrganizationMinOrderByAggregateInput
    _sum?: OrganizationSumOrderByAggregateInput
  }

  export type OrganizationScalarWhereWithAggregatesInput = {
    AND?: OrganizationScalarWhereWithAggregatesInput | OrganizationScalarWhereWithAggregatesInput[]
    OR?: OrganizationScalarWhereWithAggregatesInput[]
    NOT?: OrganizationScalarWhereWithAggregatesInput | OrganizationScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Organization"> | string
    canonicalName?: StringWithAggregatesFilter<"Organization"> | string
    dedupeKey?: StringWithAggregatesFilter<"Organization"> | string
    domain?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    website?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    linkedinUrl?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    description?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    logoUrl?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    industry?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    location?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    city?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    state?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    country?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    foundedYear?: IntNullableWithAggregatesFilter<"Organization"> | number | null
    employeeCount?: IntNullableWithAggregatesFilter<"Organization"> | number | null
    status?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    stageProxy?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    tags?: StringNullableListFilter<"Organization">
    isYcBacked?: BoolWithAggregatesFilter<"Organization"> | boolean
    ycBatch?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    ycId?: StringNullableWithAggregatesFilter<"Organization"> | string | null
    ycRawJson?: JsonNullableWithAggregatesFilter<"Organization">
    sourceIds?: StringNullableListFilter<"Organization">
    createdAt?: DateTimeWithAggregatesFilter<"Organization"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Organization"> | Date | string
  }

  export type PersonWhereInput = {
    AND?: PersonWhereInput | PersonWhereInput[]
    OR?: PersonWhereInput[]
    NOT?: PersonWhereInput | PersonWhereInput[]
    id?: StringFilter<"Person"> | string
    canonicalName?: StringFilter<"Person"> | string
    dedupeKey?: StringFilter<"Person"> | string
    firstName?: StringNullableFilter<"Person"> | string | null
    lastName?: StringNullableFilter<"Person"> | string | null
    email?: StringNullableFilter<"Person"> | string | null
    linkedinUrl?: StringNullableFilter<"Person"> | string | null
    twitterUrl?: StringNullableFilter<"Person"> | string | null
    githubUrl?: StringNullableFilter<"Person"> | string | null
    avatarUrl?: StringNullableFilter<"Person"> | string | null
    bio?: StringNullableFilter<"Person"> | string | null
    location?: StringNullableFilter<"Person"> | string | null
    city?: StringNullableFilter<"Person"> | string | null
    country?: StringNullableFilter<"Person"> | string | null
    expertise?: StringNullableListFilter<"Person">
    ycId?: StringNullableFilter<"Person"> | string | null
    sourceIds?: StringNullableListFilter<"Person">
    createdAt?: DateTimeFilter<"Person"> | Date | string
    updatedAt?: DateTimeFilter<"Person"> | Date | string
    roles?: RoleListRelationFilter
    sourceRecords?: SourceRecordListRelationFilter
    matchDecisions?: MatchDecisionListRelationFilter
    ycPerson?: XOR<YcPersonNullableRelationFilter, YcPersonWhereInput> | null
  }

  export type PersonOrderByWithRelationInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    firstName?: SortOrderInput | SortOrder
    lastName?: SortOrderInput | SortOrder
    email?: SortOrderInput | SortOrder
    linkedinUrl?: SortOrderInput | SortOrder
    twitterUrl?: SortOrderInput | SortOrder
    githubUrl?: SortOrderInput | SortOrder
    avatarUrl?: SortOrderInput | SortOrder
    bio?: SortOrderInput | SortOrder
    location?: SortOrderInput | SortOrder
    city?: SortOrderInput | SortOrder
    country?: SortOrderInput | SortOrder
    expertise?: SortOrder
    ycId?: SortOrderInput | SortOrder
    sourceIds?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    roles?: RoleOrderByRelationAggregateInput
    sourceRecords?: SourceRecordOrderByRelationAggregateInput
    matchDecisions?: MatchDecisionOrderByRelationAggregateInput
    ycPerson?: YcPersonOrderByWithRelationInput
  }

  export type PersonWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    dedupeKey?: string
    email?: string
    linkedinUrl?: string
    ycId?: string
    AND?: PersonWhereInput | PersonWhereInput[]
    OR?: PersonWhereInput[]
    NOT?: PersonWhereInput | PersonWhereInput[]
    canonicalName?: StringFilter<"Person"> | string
    firstName?: StringNullableFilter<"Person"> | string | null
    lastName?: StringNullableFilter<"Person"> | string | null
    twitterUrl?: StringNullableFilter<"Person"> | string | null
    githubUrl?: StringNullableFilter<"Person"> | string | null
    avatarUrl?: StringNullableFilter<"Person"> | string | null
    bio?: StringNullableFilter<"Person"> | string | null
    location?: StringNullableFilter<"Person"> | string | null
    city?: StringNullableFilter<"Person"> | string | null
    country?: StringNullableFilter<"Person"> | string | null
    expertise?: StringNullableListFilter<"Person">
    sourceIds?: StringNullableListFilter<"Person">
    createdAt?: DateTimeFilter<"Person"> | Date | string
    updatedAt?: DateTimeFilter<"Person"> | Date | string
    roles?: RoleListRelationFilter
    sourceRecords?: SourceRecordListRelationFilter
    matchDecisions?: MatchDecisionListRelationFilter
    ycPerson?: XOR<YcPersonNullableRelationFilter, YcPersonWhereInput> | null
  }, "id" | "dedupeKey" | "email" | "linkedinUrl" | "ycId">

  export type PersonOrderByWithAggregationInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    firstName?: SortOrderInput | SortOrder
    lastName?: SortOrderInput | SortOrder
    email?: SortOrderInput | SortOrder
    linkedinUrl?: SortOrderInput | SortOrder
    twitterUrl?: SortOrderInput | SortOrder
    githubUrl?: SortOrderInput | SortOrder
    avatarUrl?: SortOrderInput | SortOrder
    bio?: SortOrderInput | SortOrder
    location?: SortOrderInput | SortOrder
    city?: SortOrderInput | SortOrder
    country?: SortOrderInput | SortOrder
    expertise?: SortOrder
    ycId?: SortOrderInput | SortOrder
    sourceIds?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: PersonCountOrderByAggregateInput
    _max?: PersonMaxOrderByAggregateInput
    _min?: PersonMinOrderByAggregateInput
  }

  export type PersonScalarWhereWithAggregatesInput = {
    AND?: PersonScalarWhereWithAggregatesInput | PersonScalarWhereWithAggregatesInput[]
    OR?: PersonScalarWhereWithAggregatesInput[]
    NOT?: PersonScalarWhereWithAggregatesInput | PersonScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Person"> | string
    canonicalName?: StringWithAggregatesFilter<"Person"> | string
    dedupeKey?: StringWithAggregatesFilter<"Person"> | string
    firstName?: StringNullableWithAggregatesFilter<"Person"> | string | null
    lastName?: StringNullableWithAggregatesFilter<"Person"> | string | null
    email?: StringNullableWithAggregatesFilter<"Person"> | string | null
    linkedinUrl?: StringNullableWithAggregatesFilter<"Person"> | string | null
    twitterUrl?: StringNullableWithAggregatesFilter<"Person"> | string | null
    githubUrl?: StringNullableWithAggregatesFilter<"Person"> | string | null
    avatarUrl?: StringNullableWithAggregatesFilter<"Person"> | string | null
    bio?: StringNullableWithAggregatesFilter<"Person"> | string | null
    location?: StringNullableWithAggregatesFilter<"Person"> | string | null
    city?: StringNullableWithAggregatesFilter<"Person"> | string | null
    country?: StringNullableWithAggregatesFilter<"Person"> | string | null
    expertise?: StringNullableListFilter<"Person">
    ycId?: StringNullableWithAggregatesFilter<"Person"> | string | null
    sourceIds?: StringNullableListFilter<"Person">
    createdAt?: DateTimeWithAggregatesFilter<"Person"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Person"> | Date | string
  }

  export type RoleWhereInput = {
    AND?: RoleWhereInput | RoleWhereInput[]
    OR?: RoleWhereInput[]
    NOT?: RoleWhereInput | RoleWhereInput[]
    id?: StringFilter<"Role"> | string
    personId?: StringFilter<"Role"> | string
    organizationId?: StringFilter<"Role"> | string
    title?: StringNullableFilter<"Role"> | string | null
    roleType?: StringNullableFilter<"Role"> | string | null
    functionType?: StringNullableFilter<"Role"> | string | null
    isCurrent?: BoolFilter<"Role"> | boolean
    startDate?: DateTimeNullableFilter<"Role"> | Date | string | null
    endDate?: DateTimeNullableFilter<"Role"> | Date | string | null
    createdAt?: DateTimeFilter<"Role"> | Date | string
    updatedAt?: DateTimeFilter<"Role"> | Date | string
    person?: XOR<PersonRelationFilter, PersonWhereInput>
    organization?: XOR<OrganizationRelationFilter, OrganizationWhereInput>
  }

  export type RoleOrderByWithRelationInput = {
    id?: SortOrder
    personId?: SortOrder
    organizationId?: SortOrder
    title?: SortOrderInput | SortOrder
    roleType?: SortOrderInput | SortOrder
    functionType?: SortOrderInput | SortOrder
    isCurrent?: SortOrder
    startDate?: SortOrderInput | SortOrder
    endDate?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    person?: PersonOrderByWithRelationInput
    organization?: OrganizationOrderByWithRelationInput
  }

  export type RoleWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    personId_organizationId_roleType?: RolePersonIdOrganizationIdRoleTypeCompoundUniqueInput
    AND?: RoleWhereInput | RoleWhereInput[]
    OR?: RoleWhereInput[]
    NOT?: RoleWhereInput | RoleWhereInput[]
    personId?: StringFilter<"Role"> | string
    organizationId?: StringFilter<"Role"> | string
    title?: StringNullableFilter<"Role"> | string | null
    roleType?: StringNullableFilter<"Role"> | string | null
    functionType?: StringNullableFilter<"Role"> | string | null
    isCurrent?: BoolFilter<"Role"> | boolean
    startDate?: DateTimeNullableFilter<"Role"> | Date | string | null
    endDate?: DateTimeNullableFilter<"Role"> | Date | string | null
    createdAt?: DateTimeFilter<"Role"> | Date | string
    updatedAt?: DateTimeFilter<"Role"> | Date | string
    person?: XOR<PersonRelationFilter, PersonWhereInput>
    organization?: XOR<OrganizationRelationFilter, OrganizationWhereInput>
  }, "id" | "personId_organizationId_roleType">

  export type RoleOrderByWithAggregationInput = {
    id?: SortOrder
    personId?: SortOrder
    organizationId?: SortOrder
    title?: SortOrderInput | SortOrder
    roleType?: SortOrderInput | SortOrder
    functionType?: SortOrderInput | SortOrder
    isCurrent?: SortOrder
    startDate?: SortOrderInput | SortOrder
    endDate?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: RoleCountOrderByAggregateInput
    _max?: RoleMaxOrderByAggregateInput
    _min?: RoleMinOrderByAggregateInput
  }

  export type RoleScalarWhereWithAggregatesInput = {
    AND?: RoleScalarWhereWithAggregatesInput | RoleScalarWhereWithAggregatesInput[]
    OR?: RoleScalarWhereWithAggregatesInput[]
    NOT?: RoleScalarWhereWithAggregatesInput | RoleScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Role"> | string
    personId?: StringWithAggregatesFilter<"Role"> | string
    organizationId?: StringWithAggregatesFilter<"Role"> | string
    title?: StringNullableWithAggregatesFilter<"Role"> | string | null
    roleType?: StringNullableWithAggregatesFilter<"Role"> | string | null
    functionType?: StringNullableWithAggregatesFilter<"Role"> | string | null
    isCurrent?: BoolWithAggregatesFilter<"Role"> | boolean
    startDate?: DateTimeNullableWithAggregatesFilter<"Role"> | Date | string | null
    endDate?: DateTimeNullableWithAggregatesFilter<"Role"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Role"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Role"> | Date | string
  }

  export type SourceRecordWhereInput = {
    AND?: SourceRecordWhereInput | SourceRecordWhereInput[]
    OR?: SourceRecordWhereInput[]
    NOT?: SourceRecordWhereInput | SourceRecordWhereInput[]
    id?: StringFilter<"SourceRecord"> | string
    sourceAdapter?: StringFilter<"SourceRecord"> | string
    sourceUrl?: StringFilter<"SourceRecord"> | string
    sourceId?: StringNullableFilter<"SourceRecord"> | string | null
    rawPayload?: JsonFilter<"SourceRecord">
    entityType?: StringFilter<"SourceRecord"> | string
    fetchedAt?: DateTimeFilter<"SourceRecord"> | Date | string
    normalizedAt?: DateTimeNullableFilter<"SourceRecord"> | Date | string | null
    organizationId?: StringNullableFilter<"SourceRecord"> | string | null
    personId?: StringNullableFilter<"SourceRecord"> | string | null
    organization?: XOR<OrganizationNullableRelationFilter, OrganizationWhereInput> | null
    person?: XOR<PersonNullableRelationFilter, PersonWhereInput> | null
  }

  export type SourceRecordOrderByWithRelationInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    sourceUrl?: SortOrder
    sourceId?: SortOrderInput | SortOrder
    rawPayload?: SortOrder
    entityType?: SortOrder
    fetchedAt?: SortOrder
    normalizedAt?: SortOrderInput | SortOrder
    organizationId?: SortOrderInput | SortOrder
    personId?: SortOrderInput | SortOrder
    organization?: OrganizationOrderByWithRelationInput
    person?: PersonOrderByWithRelationInput
  }

  export type SourceRecordWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    sourceAdapter_sourceId?: SourceRecordSourceAdapterSourceIdCompoundUniqueInput
    AND?: SourceRecordWhereInput | SourceRecordWhereInput[]
    OR?: SourceRecordWhereInput[]
    NOT?: SourceRecordWhereInput | SourceRecordWhereInput[]
    sourceAdapter?: StringFilter<"SourceRecord"> | string
    sourceUrl?: StringFilter<"SourceRecord"> | string
    sourceId?: StringNullableFilter<"SourceRecord"> | string | null
    rawPayload?: JsonFilter<"SourceRecord">
    entityType?: StringFilter<"SourceRecord"> | string
    fetchedAt?: DateTimeFilter<"SourceRecord"> | Date | string
    normalizedAt?: DateTimeNullableFilter<"SourceRecord"> | Date | string | null
    organizationId?: StringNullableFilter<"SourceRecord"> | string | null
    personId?: StringNullableFilter<"SourceRecord"> | string | null
    organization?: XOR<OrganizationNullableRelationFilter, OrganizationWhereInput> | null
    person?: XOR<PersonNullableRelationFilter, PersonWhereInput> | null
  }, "id" | "sourceAdapter_sourceId">

  export type SourceRecordOrderByWithAggregationInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    sourceUrl?: SortOrder
    sourceId?: SortOrderInput | SortOrder
    rawPayload?: SortOrder
    entityType?: SortOrder
    fetchedAt?: SortOrder
    normalizedAt?: SortOrderInput | SortOrder
    organizationId?: SortOrderInput | SortOrder
    personId?: SortOrderInput | SortOrder
    _count?: SourceRecordCountOrderByAggregateInput
    _max?: SourceRecordMaxOrderByAggregateInput
    _min?: SourceRecordMinOrderByAggregateInput
  }

  export type SourceRecordScalarWhereWithAggregatesInput = {
    AND?: SourceRecordScalarWhereWithAggregatesInput | SourceRecordScalarWhereWithAggregatesInput[]
    OR?: SourceRecordScalarWhereWithAggregatesInput[]
    NOT?: SourceRecordScalarWhereWithAggregatesInput | SourceRecordScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SourceRecord"> | string
    sourceAdapter?: StringWithAggregatesFilter<"SourceRecord"> | string
    sourceUrl?: StringWithAggregatesFilter<"SourceRecord"> | string
    sourceId?: StringNullableWithAggregatesFilter<"SourceRecord"> | string | null
    rawPayload?: JsonWithAggregatesFilter<"SourceRecord">
    entityType?: StringWithAggregatesFilter<"SourceRecord"> | string
    fetchedAt?: DateTimeWithAggregatesFilter<"SourceRecord"> | Date | string
    normalizedAt?: DateTimeNullableWithAggregatesFilter<"SourceRecord"> | Date | string | null
    organizationId?: StringNullableWithAggregatesFilter<"SourceRecord"> | string | null
    personId?: StringNullableWithAggregatesFilter<"SourceRecord"> | string | null
  }

  export type IngestionJobWhereInput = {
    AND?: IngestionJobWhereInput | IngestionJobWhereInput[]
    OR?: IngestionJobWhereInput[]
    NOT?: IngestionJobWhereInput | IngestionJobWhereInput[]
    id?: StringFilter<"IngestionJob"> | string
    sourceAdapter?: StringFilter<"IngestionJob"> | string
    status?: StringFilter<"IngestionJob"> | string
    triggeredBy?: StringNullableFilter<"IngestionJob"> | string | null
    error?: StringNullableFilter<"IngestionJob"> | string | null
    stats?: JsonNullableFilter<"IngestionJob">
    startedAt?: DateTimeNullableFilter<"IngestionJob"> | Date | string | null
    completedAt?: DateTimeNullableFilter<"IngestionJob"> | Date | string | null
    createdAt?: DateTimeFilter<"IngestionJob"> | Date | string
    updatedAt?: DateTimeFilter<"IngestionJob"> | Date | string
  }

  export type IngestionJobOrderByWithRelationInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    status?: SortOrder
    triggeredBy?: SortOrderInput | SortOrder
    error?: SortOrderInput | SortOrder
    stats?: SortOrderInput | SortOrder
    startedAt?: SortOrderInput | SortOrder
    completedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IngestionJobWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: IngestionJobWhereInput | IngestionJobWhereInput[]
    OR?: IngestionJobWhereInput[]
    NOT?: IngestionJobWhereInput | IngestionJobWhereInput[]
    sourceAdapter?: StringFilter<"IngestionJob"> | string
    status?: StringFilter<"IngestionJob"> | string
    triggeredBy?: StringNullableFilter<"IngestionJob"> | string | null
    error?: StringNullableFilter<"IngestionJob"> | string | null
    stats?: JsonNullableFilter<"IngestionJob">
    startedAt?: DateTimeNullableFilter<"IngestionJob"> | Date | string | null
    completedAt?: DateTimeNullableFilter<"IngestionJob"> | Date | string | null
    createdAt?: DateTimeFilter<"IngestionJob"> | Date | string
    updatedAt?: DateTimeFilter<"IngestionJob"> | Date | string
  }, "id">

  export type IngestionJobOrderByWithAggregationInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    status?: SortOrder
    triggeredBy?: SortOrderInput | SortOrder
    error?: SortOrderInput | SortOrder
    stats?: SortOrderInput | SortOrder
    startedAt?: SortOrderInput | SortOrder
    completedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: IngestionJobCountOrderByAggregateInput
    _max?: IngestionJobMaxOrderByAggregateInput
    _min?: IngestionJobMinOrderByAggregateInput
  }

  export type IngestionJobScalarWhereWithAggregatesInput = {
    AND?: IngestionJobScalarWhereWithAggregatesInput | IngestionJobScalarWhereWithAggregatesInput[]
    OR?: IngestionJobScalarWhereWithAggregatesInput[]
    NOT?: IngestionJobScalarWhereWithAggregatesInput | IngestionJobScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"IngestionJob"> | string
    sourceAdapter?: StringWithAggregatesFilter<"IngestionJob"> | string
    status?: StringWithAggregatesFilter<"IngestionJob"> | string
    triggeredBy?: StringNullableWithAggregatesFilter<"IngestionJob"> | string | null
    error?: StringNullableWithAggregatesFilter<"IngestionJob"> | string | null
    stats?: JsonNullableWithAggregatesFilter<"IngestionJob">
    startedAt?: DateTimeNullableWithAggregatesFilter<"IngestionJob"> | Date | string | null
    completedAt?: DateTimeNullableWithAggregatesFilter<"IngestionJob"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"IngestionJob"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"IngestionJob"> | Date | string
  }

  export type YcCompanyWhereInput = {
    AND?: YcCompanyWhereInput | YcCompanyWhereInput[]
    OR?: YcCompanyWhereInput[]
    NOT?: YcCompanyWhereInput | YcCompanyWhereInput[]
    id?: StringFilter<"YcCompany"> | string
    ycId?: StringFilter<"YcCompany"> | string
    slug?: StringFilter<"YcCompany"> | string
    name?: StringFilter<"YcCompany"> | string
    batch?: StringFilter<"YcCompany"> | string
    status?: StringNullableFilter<"YcCompany"> | string | null
    website?: StringNullableFilter<"YcCompany"> | string | null
    description?: StringNullableFilter<"YcCompany"> | string | null
    longDescription?: StringNullableFilter<"YcCompany"> | string | null
    teamSize?: IntNullableFilter<"YcCompany"> | number | null
    allLocations?: StringNullableFilter<"YcCompany"> | string | null
    industries?: StringNullableListFilter<"YcCompany">
    subverticals?: StringNullableListFilter<"YcCompany">
    tags?: StringNullableListFilter<"YcCompany">
    badges?: JsonNullableFilter<"YcCompany">
    foundersRaw?: JsonNullableFilter<"YcCompany">
    rawJson?: JsonFilter<"YcCompany">
    organizationId?: StringNullableFilter<"YcCompany"> | string | null
    createdAt?: DateTimeFilter<"YcCompany"> | Date | string
    updatedAt?: DateTimeFilter<"YcCompany"> | Date | string
    organization?: XOR<OrganizationNullableRelationFilter, OrganizationWhereInput> | null
    ycPersons?: YcPersonListRelationFilter
  }

  export type YcCompanyOrderByWithRelationInput = {
    id?: SortOrder
    ycId?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    batch?: SortOrder
    status?: SortOrderInput | SortOrder
    website?: SortOrderInput | SortOrder
    description?: SortOrderInput | SortOrder
    longDescription?: SortOrderInput | SortOrder
    teamSize?: SortOrderInput | SortOrder
    allLocations?: SortOrderInput | SortOrder
    industries?: SortOrder
    subverticals?: SortOrder
    tags?: SortOrder
    badges?: SortOrderInput | SortOrder
    foundersRaw?: SortOrderInput | SortOrder
    rawJson?: SortOrder
    organizationId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
    ycPersons?: YcPersonOrderByRelationAggregateInput
  }

  export type YcCompanyWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    ycId?: string
    slug?: string
    organizationId?: string
    AND?: YcCompanyWhereInput | YcCompanyWhereInput[]
    OR?: YcCompanyWhereInput[]
    NOT?: YcCompanyWhereInput | YcCompanyWhereInput[]
    name?: StringFilter<"YcCompany"> | string
    batch?: StringFilter<"YcCompany"> | string
    status?: StringNullableFilter<"YcCompany"> | string | null
    website?: StringNullableFilter<"YcCompany"> | string | null
    description?: StringNullableFilter<"YcCompany"> | string | null
    longDescription?: StringNullableFilter<"YcCompany"> | string | null
    teamSize?: IntNullableFilter<"YcCompany"> | number | null
    allLocations?: StringNullableFilter<"YcCompany"> | string | null
    industries?: StringNullableListFilter<"YcCompany">
    subverticals?: StringNullableListFilter<"YcCompany">
    tags?: StringNullableListFilter<"YcCompany">
    badges?: JsonNullableFilter<"YcCompany">
    foundersRaw?: JsonNullableFilter<"YcCompany">
    rawJson?: JsonFilter<"YcCompany">
    createdAt?: DateTimeFilter<"YcCompany"> | Date | string
    updatedAt?: DateTimeFilter<"YcCompany"> | Date | string
    organization?: XOR<OrganizationNullableRelationFilter, OrganizationWhereInput> | null
    ycPersons?: YcPersonListRelationFilter
  }, "id" | "ycId" | "slug" | "organizationId">

  export type YcCompanyOrderByWithAggregationInput = {
    id?: SortOrder
    ycId?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    batch?: SortOrder
    status?: SortOrderInput | SortOrder
    website?: SortOrderInput | SortOrder
    description?: SortOrderInput | SortOrder
    longDescription?: SortOrderInput | SortOrder
    teamSize?: SortOrderInput | SortOrder
    allLocations?: SortOrderInput | SortOrder
    industries?: SortOrder
    subverticals?: SortOrder
    tags?: SortOrder
    badges?: SortOrderInput | SortOrder
    foundersRaw?: SortOrderInput | SortOrder
    rawJson?: SortOrder
    organizationId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: YcCompanyCountOrderByAggregateInput
    _avg?: YcCompanyAvgOrderByAggregateInput
    _max?: YcCompanyMaxOrderByAggregateInput
    _min?: YcCompanyMinOrderByAggregateInput
    _sum?: YcCompanySumOrderByAggregateInput
  }

  export type YcCompanyScalarWhereWithAggregatesInput = {
    AND?: YcCompanyScalarWhereWithAggregatesInput | YcCompanyScalarWhereWithAggregatesInput[]
    OR?: YcCompanyScalarWhereWithAggregatesInput[]
    NOT?: YcCompanyScalarWhereWithAggregatesInput | YcCompanyScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"YcCompany"> | string
    ycId?: StringWithAggregatesFilter<"YcCompany"> | string
    slug?: StringWithAggregatesFilter<"YcCompany"> | string
    name?: StringWithAggregatesFilter<"YcCompany"> | string
    batch?: StringWithAggregatesFilter<"YcCompany"> | string
    status?: StringNullableWithAggregatesFilter<"YcCompany"> | string | null
    website?: StringNullableWithAggregatesFilter<"YcCompany"> | string | null
    description?: StringNullableWithAggregatesFilter<"YcCompany"> | string | null
    longDescription?: StringNullableWithAggregatesFilter<"YcCompany"> | string | null
    teamSize?: IntNullableWithAggregatesFilter<"YcCompany"> | number | null
    allLocations?: StringNullableWithAggregatesFilter<"YcCompany"> | string | null
    industries?: StringNullableListFilter<"YcCompany">
    subverticals?: StringNullableListFilter<"YcCompany">
    tags?: StringNullableListFilter<"YcCompany">
    badges?: JsonNullableWithAggregatesFilter<"YcCompany">
    foundersRaw?: JsonNullableWithAggregatesFilter<"YcCompany">
    rawJson?: JsonWithAggregatesFilter<"YcCompany">
    organizationId?: StringNullableWithAggregatesFilter<"YcCompany"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"YcCompany"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"YcCompany"> | Date | string
  }

  export type YcPersonWhereInput = {
    AND?: YcPersonWhereInput | YcPersonWhereInput[]
    OR?: YcPersonWhereInput[]
    NOT?: YcPersonWhereInput | YcPersonWhereInput[]
    id?: StringFilter<"YcPerson"> | string
    ycId?: StringFilter<"YcPerson"> | string
    name?: StringFilter<"YcPerson"> | string
    role?: StringNullableFilter<"YcPerson"> | string | null
    linkedinUrl?: StringNullableFilter<"YcPerson"> | string | null
    twitterUrl?: StringNullableFilter<"YcPerson"> | string | null
    avatarUrl?: StringNullableFilter<"YcPerson"> | string | null
    bio?: StringNullableFilter<"YcPerson"> | string | null
    ycCompanyId?: StringNullableFilter<"YcPerson"> | string | null
    personId?: StringNullableFilter<"YcPerson"> | string | null
    createdAt?: DateTimeFilter<"YcPerson"> | Date | string
    updatedAt?: DateTimeFilter<"YcPerson"> | Date | string
    ycCompany?: XOR<YcCompanyNullableRelationFilter, YcCompanyWhereInput> | null
    person?: XOR<PersonNullableRelationFilter, PersonWhereInput> | null
  }

  export type YcPersonOrderByWithRelationInput = {
    id?: SortOrder
    ycId?: SortOrder
    name?: SortOrder
    role?: SortOrderInput | SortOrder
    linkedinUrl?: SortOrderInput | SortOrder
    twitterUrl?: SortOrderInput | SortOrder
    avatarUrl?: SortOrderInput | SortOrder
    bio?: SortOrderInput | SortOrder
    ycCompanyId?: SortOrderInput | SortOrder
    personId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    ycCompany?: YcCompanyOrderByWithRelationInput
    person?: PersonOrderByWithRelationInput
  }

  export type YcPersonWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    ycId?: string
    personId?: string
    AND?: YcPersonWhereInput | YcPersonWhereInput[]
    OR?: YcPersonWhereInput[]
    NOT?: YcPersonWhereInput | YcPersonWhereInput[]
    name?: StringFilter<"YcPerson"> | string
    role?: StringNullableFilter<"YcPerson"> | string | null
    linkedinUrl?: StringNullableFilter<"YcPerson"> | string | null
    twitterUrl?: StringNullableFilter<"YcPerson"> | string | null
    avatarUrl?: StringNullableFilter<"YcPerson"> | string | null
    bio?: StringNullableFilter<"YcPerson"> | string | null
    ycCompanyId?: StringNullableFilter<"YcPerson"> | string | null
    createdAt?: DateTimeFilter<"YcPerson"> | Date | string
    updatedAt?: DateTimeFilter<"YcPerson"> | Date | string
    ycCompany?: XOR<YcCompanyNullableRelationFilter, YcCompanyWhereInput> | null
    person?: XOR<PersonNullableRelationFilter, PersonWhereInput> | null
  }, "id" | "ycId" | "personId">

  export type YcPersonOrderByWithAggregationInput = {
    id?: SortOrder
    ycId?: SortOrder
    name?: SortOrder
    role?: SortOrderInput | SortOrder
    linkedinUrl?: SortOrderInput | SortOrder
    twitterUrl?: SortOrderInput | SortOrder
    avatarUrl?: SortOrderInput | SortOrder
    bio?: SortOrderInput | SortOrder
    ycCompanyId?: SortOrderInput | SortOrder
    personId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: YcPersonCountOrderByAggregateInput
    _max?: YcPersonMaxOrderByAggregateInput
    _min?: YcPersonMinOrderByAggregateInput
  }

  export type YcPersonScalarWhereWithAggregatesInput = {
    AND?: YcPersonScalarWhereWithAggregatesInput | YcPersonScalarWhereWithAggregatesInput[]
    OR?: YcPersonScalarWhereWithAggregatesInput[]
    NOT?: YcPersonScalarWhereWithAggregatesInput | YcPersonScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"YcPerson"> | string
    ycId?: StringWithAggregatesFilter<"YcPerson"> | string
    name?: StringWithAggregatesFilter<"YcPerson"> | string
    role?: StringNullableWithAggregatesFilter<"YcPerson"> | string | null
    linkedinUrl?: StringNullableWithAggregatesFilter<"YcPerson"> | string | null
    twitterUrl?: StringNullableWithAggregatesFilter<"YcPerson"> | string | null
    avatarUrl?: StringNullableWithAggregatesFilter<"YcPerson"> | string | null
    bio?: StringNullableWithAggregatesFilter<"YcPerson"> | string | null
    ycCompanyId?: StringNullableWithAggregatesFilter<"YcPerson"> | string | null
    personId?: StringNullableWithAggregatesFilter<"YcPerson"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"YcPerson"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"YcPerson"> | Date | string
  }

  export type MatchDecisionWhereInput = {
    AND?: MatchDecisionWhereInput | MatchDecisionWhereInput[]
    OR?: MatchDecisionWhereInput[]
    NOT?: MatchDecisionWhereInput | MatchDecisionWhereInput[]
    id?: StringFilter<"MatchDecision"> | string
    entityType?: StringFilter<"MatchDecision"> | string
    candidateIds?: StringNullableListFilter<"MatchDecision">
    selectedId?: StringNullableFilter<"MatchDecision"> | string | null
    matchRuleUsed?: StringFilter<"MatchDecision"> | string
    confidenceScore?: FloatFilter<"MatchDecision"> | number
    decisionType?: StringFilter<"MatchDecision"> | string
    resolverVersion?: StringFilter<"MatchDecision"> | string
    metadata?: JsonNullableFilter<"MatchDecision">
    organizationId?: StringNullableFilter<"MatchDecision"> | string | null
    personId?: StringNullableFilter<"MatchDecision"> | string | null
    createdAt?: DateTimeFilter<"MatchDecision"> | Date | string
    organization?: XOR<OrganizationNullableRelationFilter, OrganizationWhereInput> | null
    person?: XOR<PersonNullableRelationFilter, PersonWhereInput> | null
  }

  export type MatchDecisionOrderByWithRelationInput = {
    id?: SortOrder
    entityType?: SortOrder
    candidateIds?: SortOrder
    selectedId?: SortOrderInput | SortOrder
    matchRuleUsed?: SortOrder
    confidenceScore?: SortOrder
    decisionType?: SortOrder
    resolverVersion?: SortOrder
    metadata?: SortOrderInput | SortOrder
    organizationId?: SortOrderInput | SortOrder
    personId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
    person?: PersonOrderByWithRelationInput
  }

  export type MatchDecisionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: MatchDecisionWhereInput | MatchDecisionWhereInput[]
    OR?: MatchDecisionWhereInput[]
    NOT?: MatchDecisionWhereInput | MatchDecisionWhereInput[]
    entityType?: StringFilter<"MatchDecision"> | string
    candidateIds?: StringNullableListFilter<"MatchDecision">
    selectedId?: StringNullableFilter<"MatchDecision"> | string | null
    matchRuleUsed?: StringFilter<"MatchDecision"> | string
    confidenceScore?: FloatFilter<"MatchDecision"> | number
    decisionType?: StringFilter<"MatchDecision"> | string
    resolverVersion?: StringFilter<"MatchDecision"> | string
    metadata?: JsonNullableFilter<"MatchDecision">
    organizationId?: StringNullableFilter<"MatchDecision"> | string | null
    personId?: StringNullableFilter<"MatchDecision"> | string | null
    createdAt?: DateTimeFilter<"MatchDecision"> | Date | string
    organization?: XOR<OrganizationNullableRelationFilter, OrganizationWhereInput> | null
    person?: XOR<PersonNullableRelationFilter, PersonWhereInput> | null
  }, "id">

  export type MatchDecisionOrderByWithAggregationInput = {
    id?: SortOrder
    entityType?: SortOrder
    candidateIds?: SortOrder
    selectedId?: SortOrderInput | SortOrder
    matchRuleUsed?: SortOrder
    confidenceScore?: SortOrder
    decisionType?: SortOrder
    resolverVersion?: SortOrder
    metadata?: SortOrderInput | SortOrder
    organizationId?: SortOrderInput | SortOrder
    personId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: MatchDecisionCountOrderByAggregateInput
    _avg?: MatchDecisionAvgOrderByAggregateInput
    _max?: MatchDecisionMaxOrderByAggregateInput
    _min?: MatchDecisionMinOrderByAggregateInput
    _sum?: MatchDecisionSumOrderByAggregateInput
  }

  export type MatchDecisionScalarWhereWithAggregatesInput = {
    AND?: MatchDecisionScalarWhereWithAggregatesInput | MatchDecisionScalarWhereWithAggregatesInput[]
    OR?: MatchDecisionScalarWhereWithAggregatesInput[]
    NOT?: MatchDecisionScalarWhereWithAggregatesInput | MatchDecisionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"MatchDecision"> | string
    entityType?: StringWithAggregatesFilter<"MatchDecision"> | string
    candidateIds?: StringNullableListFilter<"MatchDecision">
    selectedId?: StringNullableWithAggregatesFilter<"MatchDecision"> | string | null
    matchRuleUsed?: StringWithAggregatesFilter<"MatchDecision"> | string
    confidenceScore?: FloatWithAggregatesFilter<"MatchDecision"> | number
    decisionType?: StringWithAggregatesFilter<"MatchDecision"> | string
    resolverVersion?: StringWithAggregatesFilter<"MatchDecision"> | string
    metadata?: JsonNullableWithAggregatesFilter<"MatchDecision">
    organizationId?: StringNullableWithAggregatesFilter<"MatchDecision"> | string | null
    personId?: StringNullableWithAggregatesFilter<"MatchDecision"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"MatchDecision"> | Date | string
  }

  export type OrganizationCreateInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleCreateNestedManyWithoutOrganizationInput
    sourceRecords?: SourceRecordCreateNestedManyWithoutOrganizationInput
    matchDecisions?: MatchDecisionCreateNestedManyWithoutOrganizationInput
    ycCompany?: YcCompanyCreateNestedOneWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleUncheckedCreateNestedManyWithoutOrganizationInput
    sourceRecords?: SourceRecordUncheckedCreateNestedManyWithoutOrganizationInput
    matchDecisions?: MatchDecisionUncheckedCreateNestedManyWithoutOrganizationInput
    ycCompany?: YcCompanyUncheckedCreateNestedOneWithoutOrganizationInput
  }

  export type OrganizationUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUpdateManyWithoutOrganizationNestedInput
    sourceRecords?: SourceRecordUpdateManyWithoutOrganizationNestedInput
    matchDecisions?: MatchDecisionUpdateManyWithoutOrganizationNestedInput
    ycCompany?: YcCompanyUpdateOneWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUncheckedUpdateManyWithoutOrganizationNestedInput
    sourceRecords?: SourceRecordUncheckedUpdateManyWithoutOrganizationNestedInput
    matchDecisions?: MatchDecisionUncheckedUpdateManyWithoutOrganizationNestedInput
    ycCompany?: YcCompanyUncheckedUpdateOneWithoutOrganizationNestedInput
  }

  export type OrganizationCreateManyInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type OrganizationUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type OrganizationUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PersonCreateInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleCreateNestedManyWithoutPersonInput
    sourceRecords?: SourceRecordCreateNestedManyWithoutPersonInput
    matchDecisions?: MatchDecisionCreateNestedManyWithoutPersonInput
    ycPerson?: YcPersonCreateNestedOneWithoutPersonInput
  }

  export type PersonUncheckedCreateInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleUncheckedCreateNestedManyWithoutPersonInput
    sourceRecords?: SourceRecordUncheckedCreateNestedManyWithoutPersonInput
    matchDecisions?: MatchDecisionUncheckedCreateNestedManyWithoutPersonInput
    ycPerson?: YcPersonUncheckedCreateNestedOneWithoutPersonInput
  }

  export type PersonUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUpdateManyWithoutPersonNestedInput
    sourceRecords?: SourceRecordUpdateManyWithoutPersonNestedInput
    matchDecisions?: MatchDecisionUpdateManyWithoutPersonNestedInput
    ycPerson?: YcPersonUpdateOneWithoutPersonNestedInput
  }

  export type PersonUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUncheckedUpdateManyWithoutPersonNestedInput
    sourceRecords?: SourceRecordUncheckedUpdateManyWithoutPersonNestedInput
    matchDecisions?: MatchDecisionUncheckedUpdateManyWithoutPersonNestedInput
    ycPerson?: YcPersonUncheckedUpdateOneWithoutPersonNestedInput
  }

  export type PersonCreateManyInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PersonUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PersonUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleCreateInput = {
    id?: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    person: PersonCreateNestedOneWithoutRolesInput
    organization: OrganizationCreateNestedOneWithoutRolesInput
  }

  export type RoleUncheckedCreateInput = {
    id?: string
    personId: string
    organizationId: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type RoleUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    person?: PersonUpdateOneRequiredWithoutRolesNestedInput
    organization?: OrganizationUpdateOneRequiredWithoutRolesNestedInput
  }

  export type RoleUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    personId?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleCreateManyInput = {
    id?: string
    personId: string
    organizationId: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type RoleUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    personId?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SourceRecordCreateInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    organization?: OrganizationCreateNestedOneWithoutSourceRecordsInput
    person?: PersonCreateNestedOneWithoutSourceRecordsInput
  }

  export type SourceRecordUncheckedCreateInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    organizationId?: string | null
    personId?: string | null
  }

  export type SourceRecordUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    organization?: OrganizationUpdateOneWithoutSourceRecordsNestedInput
    person?: PersonUpdateOneWithoutSourceRecordsNestedInput
  }

  export type SourceRecordUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SourceRecordCreateManyInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    organizationId?: string | null
    personId?: string | null
  }

  export type SourceRecordUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SourceRecordUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type IngestionJobCreateInput = {
    id?: string
    sourceAdapter: string
    status: string
    triggeredBy?: string | null
    error?: string | null
    stats?: NullableJsonNullValueInput | InputJsonValue
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type IngestionJobUncheckedCreateInput = {
    id?: string
    sourceAdapter: string
    status: string
    triggeredBy?: string | null
    error?: string | null
    stats?: NullableJsonNullValueInput | InputJsonValue
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type IngestionJobUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    triggeredBy?: NullableStringFieldUpdateOperationsInput | string | null
    error?: NullableStringFieldUpdateOperationsInput | string | null
    stats?: NullableJsonNullValueInput | InputJsonValue
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type IngestionJobUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    triggeredBy?: NullableStringFieldUpdateOperationsInput | string | null
    error?: NullableStringFieldUpdateOperationsInput | string | null
    stats?: NullableJsonNullValueInput | InputJsonValue
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type IngestionJobCreateManyInput = {
    id?: string
    sourceAdapter: string
    status: string
    triggeredBy?: string | null
    error?: string | null
    stats?: NullableJsonNullValueInput | InputJsonValue
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type IngestionJobUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    triggeredBy?: NullableStringFieldUpdateOperationsInput | string | null
    error?: NullableStringFieldUpdateOperationsInput | string | null
    stats?: NullableJsonNullValueInput | InputJsonValue
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type IngestionJobUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    triggeredBy?: NullableStringFieldUpdateOperationsInput | string | null
    error?: NullableStringFieldUpdateOperationsInput | string | null
    stats?: NullableJsonNullValueInput | InputJsonValue
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type YcCompanyCreateInput = {
    id?: string
    ycId: string
    slug: string
    name: string
    batch: string
    status?: string | null
    website?: string | null
    description?: string | null
    longDescription?: string | null
    teamSize?: number | null
    allLocations?: string | null
    industries?: YcCompanyCreateindustriesInput | string[]
    subverticals?: YcCompanyCreatesubverticalsInput | string[]
    tags?: YcCompanyCreatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    organization?: OrganizationCreateNestedOneWithoutYcCompanyInput
    ycPersons?: YcPersonCreateNestedManyWithoutYcCompanyInput
  }

  export type YcCompanyUncheckedCreateInput = {
    id?: string
    ycId: string
    slug: string
    name: string
    batch: string
    status?: string | null
    website?: string | null
    description?: string | null
    longDescription?: string | null
    teamSize?: number | null
    allLocations?: string | null
    industries?: YcCompanyCreateindustriesInput | string[]
    subverticals?: YcCompanyCreatesubverticalsInput | string[]
    tags?: YcCompanyCreatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson: JsonNullValueInput | InputJsonValue
    organizationId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    ycPersons?: YcPersonUncheckedCreateNestedManyWithoutYcCompanyInput
  }

  export type YcCompanyUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    batch?: StringFieldUpdateOperationsInput | string
    status?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    longDescription?: NullableStringFieldUpdateOperationsInput | string | null
    teamSize?: NullableIntFieldUpdateOperationsInput | number | null
    allLocations?: NullableStringFieldUpdateOperationsInput | string | null
    industries?: YcCompanyUpdateindustriesInput | string[]
    subverticals?: YcCompanyUpdatesubverticalsInput | string[]
    tags?: YcCompanyUpdatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    organization?: OrganizationUpdateOneWithoutYcCompanyNestedInput
    ycPersons?: YcPersonUpdateManyWithoutYcCompanyNestedInput
  }

  export type YcCompanyUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    batch?: StringFieldUpdateOperationsInput | string
    status?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    longDescription?: NullableStringFieldUpdateOperationsInput | string | null
    teamSize?: NullableIntFieldUpdateOperationsInput | number | null
    allLocations?: NullableStringFieldUpdateOperationsInput | string | null
    industries?: YcCompanyUpdateindustriesInput | string[]
    subverticals?: YcCompanyUpdatesubverticalsInput | string[]
    tags?: YcCompanyUpdatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson?: JsonNullValueInput | InputJsonValue
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ycPersons?: YcPersonUncheckedUpdateManyWithoutYcCompanyNestedInput
  }

  export type YcCompanyCreateManyInput = {
    id?: string
    ycId: string
    slug: string
    name: string
    batch: string
    status?: string | null
    website?: string | null
    description?: string | null
    longDescription?: string | null
    teamSize?: number | null
    allLocations?: string | null
    industries?: YcCompanyCreateindustriesInput | string[]
    subverticals?: YcCompanyCreatesubverticalsInput | string[]
    tags?: YcCompanyCreatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson: JsonNullValueInput | InputJsonValue
    organizationId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type YcCompanyUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    batch?: StringFieldUpdateOperationsInput | string
    status?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    longDescription?: NullableStringFieldUpdateOperationsInput | string | null
    teamSize?: NullableIntFieldUpdateOperationsInput | number | null
    allLocations?: NullableStringFieldUpdateOperationsInput | string | null
    industries?: YcCompanyUpdateindustriesInput | string[]
    subverticals?: YcCompanyUpdatesubverticalsInput | string[]
    tags?: YcCompanyUpdatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type YcCompanyUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    batch?: StringFieldUpdateOperationsInput | string
    status?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    longDescription?: NullableStringFieldUpdateOperationsInput | string | null
    teamSize?: NullableIntFieldUpdateOperationsInput | number | null
    allLocations?: NullableStringFieldUpdateOperationsInput | string | null
    industries?: YcCompanyUpdateindustriesInput | string[]
    subverticals?: YcCompanyUpdatesubverticalsInput | string[]
    tags?: YcCompanyUpdatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson?: JsonNullValueInput | InputJsonValue
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type YcPersonCreateInput = {
    id?: string
    ycId: string
    name: string
    role?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    ycCompany?: YcCompanyCreateNestedOneWithoutYcPersonsInput
    person?: PersonCreateNestedOneWithoutYcPersonInput
  }

  export type YcPersonUncheckedCreateInput = {
    id?: string
    ycId: string
    name: string
    role?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    ycCompanyId?: string | null
    personId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type YcPersonUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ycCompany?: YcCompanyUpdateOneWithoutYcPersonsNestedInput
    person?: PersonUpdateOneWithoutYcPersonNestedInput
  }

  export type YcPersonUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    ycCompanyId?: NullableStringFieldUpdateOperationsInput | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type YcPersonCreateManyInput = {
    id?: string
    ycId: string
    name: string
    role?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    ycCompanyId?: string | null
    personId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type YcPersonUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type YcPersonUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    ycCompanyId?: NullableStringFieldUpdateOperationsInput | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchDecisionCreateInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    organization?: OrganizationCreateNestedOneWithoutMatchDecisionsInput
    person?: PersonCreateNestedOneWithoutMatchDecisionsInput
  }

  export type MatchDecisionUncheckedCreateInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    organizationId?: string | null
    personId?: string | null
    createdAt?: Date | string
  }

  export type MatchDecisionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    organization?: OrganizationUpdateOneWithoutMatchDecisionsNestedInput
    person?: PersonUpdateOneWithoutMatchDecisionsNestedInput
  }

  export type MatchDecisionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchDecisionCreateManyInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    organizationId?: string | null
    personId?: string | null
    createdAt?: Date | string
  }

  export type MatchDecisionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchDecisionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type StringNullableListFilter<$PrismaModel = never> = {
    equals?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    has?: string | StringFieldRefInput<$PrismaModel> | null
    hasEvery?: string[] | ListStringFieldRefInput<$PrismaModel>
    hasSome?: string[] | ListStringFieldRefInput<$PrismaModel>
    isEmpty?: boolean
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }
  export type JsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type RoleListRelationFilter = {
    every?: RoleWhereInput
    some?: RoleWhereInput
    none?: RoleWhereInput
  }

  export type SourceRecordListRelationFilter = {
    every?: SourceRecordWhereInput
    some?: SourceRecordWhereInput
    none?: SourceRecordWhereInput
  }

  export type MatchDecisionListRelationFilter = {
    every?: MatchDecisionWhereInput
    some?: MatchDecisionWhereInput
    none?: MatchDecisionWhereInput
  }

  export type YcCompanyNullableRelationFilter = {
    is?: YcCompanyWhereInput | null
    isNot?: YcCompanyWhereInput | null
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type RoleOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SourceRecordOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type MatchDecisionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type OrganizationCountOrderByAggregateInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    domain?: SortOrder
    website?: SortOrder
    linkedinUrl?: SortOrder
    description?: SortOrder
    logoUrl?: SortOrder
    industry?: SortOrder
    location?: SortOrder
    city?: SortOrder
    state?: SortOrder
    country?: SortOrder
    foundedYear?: SortOrder
    employeeCount?: SortOrder
    status?: SortOrder
    stageProxy?: SortOrder
    tags?: SortOrder
    isYcBacked?: SortOrder
    ycBatch?: SortOrder
    ycId?: SortOrder
    ycRawJson?: SortOrder
    sourceIds?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type OrganizationAvgOrderByAggregateInput = {
    foundedYear?: SortOrder
    employeeCount?: SortOrder
  }

  export type OrganizationMaxOrderByAggregateInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    domain?: SortOrder
    website?: SortOrder
    linkedinUrl?: SortOrder
    description?: SortOrder
    logoUrl?: SortOrder
    industry?: SortOrder
    location?: SortOrder
    city?: SortOrder
    state?: SortOrder
    country?: SortOrder
    foundedYear?: SortOrder
    employeeCount?: SortOrder
    status?: SortOrder
    stageProxy?: SortOrder
    isYcBacked?: SortOrder
    ycBatch?: SortOrder
    ycId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type OrganizationMinOrderByAggregateInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    domain?: SortOrder
    website?: SortOrder
    linkedinUrl?: SortOrder
    description?: SortOrder
    logoUrl?: SortOrder
    industry?: SortOrder
    location?: SortOrder
    city?: SortOrder
    state?: SortOrder
    country?: SortOrder
    foundedYear?: SortOrder
    employeeCount?: SortOrder
    status?: SortOrder
    stageProxy?: SortOrder
    isYcBacked?: SortOrder
    ycBatch?: SortOrder
    ycId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type OrganizationSumOrderByAggregateInput = {
    foundedYear?: SortOrder
    employeeCount?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type YcPersonNullableRelationFilter = {
    is?: YcPersonWhereInput | null
    isNot?: YcPersonWhereInput | null
  }

  export type PersonCountOrderByAggregateInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    firstName?: SortOrder
    lastName?: SortOrder
    email?: SortOrder
    linkedinUrl?: SortOrder
    twitterUrl?: SortOrder
    githubUrl?: SortOrder
    avatarUrl?: SortOrder
    bio?: SortOrder
    location?: SortOrder
    city?: SortOrder
    country?: SortOrder
    expertise?: SortOrder
    ycId?: SortOrder
    sourceIds?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PersonMaxOrderByAggregateInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    firstName?: SortOrder
    lastName?: SortOrder
    email?: SortOrder
    linkedinUrl?: SortOrder
    twitterUrl?: SortOrder
    githubUrl?: SortOrder
    avatarUrl?: SortOrder
    bio?: SortOrder
    location?: SortOrder
    city?: SortOrder
    country?: SortOrder
    ycId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PersonMinOrderByAggregateInput = {
    id?: SortOrder
    canonicalName?: SortOrder
    dedupeKey?: SortOrder
    firstName?: SortOrder
    lastName?: SortOrder
    email?: SortOrder
    linkedinUrl?: SortOrder
    twitterUrl?: SortOrder
    githubUrl?: SortOrder
    avatarUrl?: SortOrder
    bio?: SortOrder
    location?: SortOrder
    city?: SortOrder
    country?: SortOrder
    ycId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type PersonRelationFilter = {
    is?: PersonWhereInput
    isNot?: PersonWhereInput
  }

  export type OrganizationRelationFilter = {
    is?: OrganizationWhereInput
    isNot?: OrganizationWhereInput
  }

  export type RolePersonIdOrganizationIdRoleTypeCompoundUniqueInput = {
    personId: string
    organizationId: string
    roleType: string
  }

  export type RoleCountOrderByAggregateInput = {
    id?: SortOrder
    personId?: SortOrder
    organizationId?: SortOrder
    title?: SortOrder
    roleType?: SortOrder
    functionType?: SortOrder
    isCurrent?: SortOrder
    startDate?: SortOrder
    endDate?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type RoleMaxOrderByAggregateInput = {
    id?: SortOrder
    personId?: SortOrder
    organizationId?: SortOrder
    title?: SortOrder
    roleType?: SortOrder
    functionType?: SortOrder
    isCurrent?: SortOrder
    startDate?: SortOrder
    endDate?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type RoleMinOrderByAggregateInput = {
    id?: SortOrder
    personId?: SortOrder
    organizationId?: SortOrder
    title?: SortOrder
    roleType?: SortOrder
    functionType?: SortOrder
    isCurrent?: SortOrder
    startDate?: SortOrder
    endDate?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }
  export type JsonFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type OrganizationNullableRelationFilter = {
    is?: OrganizationWhereInput | null
    isNot?: OrganizationWhereInput | null
  }

  export type PersonNullableRelationFilter = {
    is?: PersonWhereInput | null
    isNot?: PersonWhereInput | null
  }

  export type SourceRecordSourceAdapterSourceIdCompoundUniqueInput = {
    sourceAdapter: string
    sourceId: string
  }

  export type SourceRecordCountOrderByAggregateInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    sourceUrl?: SortOrder
    sourceId?: SortOrder
    rawPayload?: SortOrder
    entityType?: SortOrder
    fetchedAt?: SortOrder
    normalizedAt?: SortOrder
    organizationId?: SortOrder
    personId?: SortOrder
  }

  export type SourceRecordMaxOrderByAggregateInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    sourceUrl?: SortOrder
    sourceId?: SortOrder
    entityType?: SortOrder
    fetchedAt?: SortOrder
    normalizedAt?: SortOrder
    organizationId?: SortOrder
    personId?: SortOrder
  }

  export type SourceRecordMinOrderByAggregateInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    sourceUrl?: SortOrder
    sourceId?: SortOrder
    entityType?: SortOrder
    fetchedAt?: SortOrder
    normalizedAt?: SortOrder
    organizationId?: SortOrder
    personId?: SortOrder
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type IngestionJobCountOrderByAggregateInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    status?: SortOrder
    triggeredBy?: SortOrder
    error?: SortOrder
    stats?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IngestionJobMaxOrderByAggregateInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    status?: SortOrder
    triggeredBy?: SortOrder
    error?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IngestionJobMinOrderByAggregateInput = {
    id?: SortOrder
    sourceAdapter?: SortOrder
    status?: SortOrder
    triggeredBy?: SortOrder
    error?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type YcPersonListRelationFilter = {
    every?: YcPersonWhereInput
    some?: YcPersonWhereInput
    none?: YcPersonWhereInput
  }

  export type YcPersonOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type YcCompanyCountOrderByAggregateInput = {
    id?: SortOrder
    ycId?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    batch?: SortOrder
    status?: SortOrder
    website?: SortOrder
    description?: SortOrder
    longDescription?: SortOrder
    teamSize?: SortOrder
    allLocations?: SortOrder
    industries?: SortOrder
    subverticals?: SortOrder
    tags?: SortOrder
    badges?: SortOrder
    foundersRaw?: SortOrder
    rawJson?: SortOrder
    organizationId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type YcCompanyAvgOrderByAggregateInput = {
    teamSize?: SortOrder
  }

  export type YcCompanyMaxOrderByAggregateInput = {
    id?: SortOrder
    ycId?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    batch?: SortOrder
    status?: SortOrder
    website?: SortOrder
    description?: SortOrder
    longDescription?: SortOrder
    teamSize?: SortOrder
    allLocations?: SortOrder
    organizationId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type YcCompanyMinOrderByAggregateInput = {
    id?: SortOrder
    ycId?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    batch?: SortOrder
    status?: SortOrder
    website?: SortOrder
    description?: SortOrder
    longDescription?: SortOrder
    teamSize?: SortOrder
    allLocations?: SortOrder
    organizationId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type YcCompanySumOrderByAggregateInput = {
    teamSize?: SortOrder
  }

  export type YcPersonCountOrderByAggregateInput = {
    id?: SortOrder
    ycId?: SortOrder
    name?: SortOrder
    role?: SortOrder
    linkedinUrl?: SortOrder
    twitterUrl?: SortOrder
    avatarUrl?: SortOrder
    bio?: SortOrder
    ycCompanyId?: SortOrder
    personId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type YcPersonMaxOrderByAggregateInput = {
    id?: SortOrder
    ycId?: SortOrder
    name?: SortOrder
    role?: SortOrder
    linkedinUrl?: SortOrder
    twitterUrl?: SortOrder
    avatarUrl?: SortOrder
    bio?: SortOrder
    ycCompanyId?: SortOrder
    personId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type YcPersonMinOrderByAggregateInput = {
    id?: SortOrder
    ycId?: SortOrder
    name?: SortOrder
    role?: SortOrder
    linkedinUrl?: SortOrder
    twitterUrl?: SortOrder
    avatarUrl?: SortOrder
    bio?: SortOrder
    ycCompanyId?: SortOrder
    personId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type MatchDecisionCountOrderByAggregateInput = {
    id?: SortOrder
    entityType?: SortOrder
    candidateIds?: SortOrder
    selectedId?: SortOrder
    matchRuleUsed?: SortOrder
    confidenceScore?: SortOrder
    decisionType?: SortOrder
    resolverVersion?: SortOrder
    metadata?: SortOrder
    organizationId?: SortOrder
    personId?: SortOrder
    createdAt?: SortOrder
  }

  export type MatchDecisionAvgOrderByAggregateInput = {
    confidenceScore?: SortOrder
  }

  export type MatchDecisionMaxOrderByAggregateInput = {
    id?: SortOrder
    entityType?: SortOrder
    selectedId?: SortOrder
    matchRuleUsed?: SortOrder
    confidenceScore?: SortOrder
    decisionType?: SortOrder
    resolverVersion?: SortOrder
    organizationId?: SortOrder
    personId?: SortOrder
    createdAt?: SortOrder
  }

  export type MatchDecisionMinOrderByAggregateInput = {
    id?: SortOrder
    entityType?: SortOrder
    selectedId?: SortOrder
    matchRuleUsed?: SortOrder
    confidenceScore?: SortOrder
    decisionType?: SortOrder
    resolverVersion?: SortOrder
    organizationId?: SortOrder
    personId?: SortOrder
    createdAt?: SortOrder
  }

  export type MatchDecisionSumOrderByAggregateInput = {
    confidenceScore?: SortOrder
  }

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type OrganizationCreatetagsInput = {
    set: string[]
  }

  export type OrganizationCreatesourceIdsInput = {
    set: string[]
  }

  export type RoleCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<RoleCreateWithoutOrganizationInput, RoleUncheckedCreateWithoutOrganizationInput> | RoleCreateWithoutOrganizationInput[] | RoleUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutOrganizationInput | RoleCreateOrConnectWithoutOrganizationInput[]
    createMany?: RoleCreateManyOrganizationInputEnvelope
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
  }

  export type SourceRecordCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<SourceRecordCreateWithoutOrganizationInput, SourceRecordUncheckedCreateWithoutOrganizationInput> | SourceRecordCreateWithoutOrganizationInput[] | SourceRecordUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: SourceRecordCreateOrConnectWithoutOrganizationInput | SourceRecordCreateOrConnectWithoutOrganizationInput[]
    createMany?: SourceRecordCreateManyOrganizationInputEnvelope
    connect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
  }

  export type MatchDecisionCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<MatchDecisionCreateWithoutOrganizationInput, MatchDecisionUncheckedCreateWithoutOrganizationInput> | MatchDecisionCreateWithoutOrganizationInput[] | MatchDecisionUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: MatchDecisionCreateOrConnectWithoutOrganizationInput | MatchDecisionCreateOrConnectWithoutOrganizationInput[]
    createMany?: MatchDecisionCreateManyOrganizationInputEnvelope
    connect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
  }

  export type YcCompanyCreateNestedOneWithoutOrganizationInput = {
    create?: XOR<YcCompanyCreateWithoutOrganizationInput, YcCompanyUncheckedCreateWithoutOrganizationInput>
    connectOrCreate?: YcCompanyCreateOrConnectWithoutOrganizationInput
    connect?: YcCompanyWhereUniqueInput
  }

  export type RoleUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<RoleCreateWithoutOrganizationInput, RoleUncheckedCreateWithoutOrganizationInput> | RoleCreateWithoutOrganizationInput[] | RoleUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutOrganizationInput | RoleCreateOrConnectWithoutOrganizationInput[]
    createMany?: RoleCreateManyOrganizationInputEnvelope
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
  }

  export type SourceRecordUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<SourceRecordCreateWithoutOrganizationInput, SourceRecordUncheckedCreateWithoutOrganizationInput> | SourceRecordCreateWithoutOrganizationInput[] | SourceRecordUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: SourceRecordCreateOrConnectWithoutOrganizationInput | SourceRecordCreateOrConnectWithoutOrganizationInput[]
    createMany?: SourceRecordCreateManyOrganizationInputEnvelope
    connect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
  }

  export type MatchDecisionUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<MatchDecisionCreateWithoutOrganizationInput, MatchDecisionUncheckedCreateWithoutOrganizationInput> | MatchDecisionCreateWithoutOrganizationInput[] | MatchDecisionUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: MatchDecisionCreateOrConnectWithoutOrganizationInput | MatchDecisionCreateOrConnectWithoutOrganizationInput[]
    createMany?: MatchDecisionCreateManyOrganizationInputEnvelope
    connect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
  }

  export type YcCompanyUncheckedCreateNestedOneWithoutOrganizationInput = {
    create?: XOR<YcCompanyCreateWithoutOrganizationInput, YcCompanyUncheckedCreateWithoutOrganizationInput>
    connectOrCreate?: YcCompanyCreateOrConnectWithoutOrganizationInput
    connect?: YcCompanyWhereUniqueInput
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type OrganizationUpdatetagsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type OrganizationUpdatesourceIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type RoleUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<RoleCreateWithoutOrganizationInput, RoleUncheckedCreateWithoutOrganizationInput> | RoleCreateWithoutOrganizationInput[] | RoleUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutOrganizationInput | RoleCreateOrConnectWithoutOrganizationInput[]
    upsert?: RoleUpsertWithWhereUniqueWithoutOrganizationInput | RoleUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: RoleCreateManyOrganizationInputEnvelope
    set?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    disconnect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    delete?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    update?: RoleUpdateWithWhereUniqueWithoutOrganizationInput | RoleUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: RoleUpdateManyWithWhereWithoutOrganizationInput | RoleUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: RoleScalarWhereInput | RoleScalarWhereInput[]
  }

  export type SourceRecordUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<SourceRecordCreateWithoutOrganizationInput, SourceRecordUncheckedCreateWithoutOrganizationInput> | SourceRecordCreateWithoutOrganizationInput[] | SourceRecordUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: SourceRecordCreateOrConnectWithoutOrganizationInput | SourceRecordCreateOrConnectWithoutOrganizationInput[]
    upsert?: SourceRecordUpsertWithWhereUniqueWithoutOrganizationInput | SourceRecordUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: SourceRecordCreateManyOrganizationInputEnvelope
    set?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    disconnect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    delete?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    connect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    update?: SourceRecordUpdateWithWhereUniqueWithoutOrganizationInput | SourceRecordUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: SourceRecordUpdateManyWithWhereWithoutOrganizationInput | SourceRecordUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: SourceRecordScalarWhereInput | SourceRecordScalarWhereInput[]
  }

  export type MatchDecisionUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<MatchDecisionCreateWithoutOrganizationInput, MatchDecisionUncheckedCreateWithoutOrganizationInput> | MatchDecisionCreateWithoutOrganizationInput[] | MatchDecisionUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: MatchDecisionCreateOrConnectWithoutOrganizationInput | MatchDecisionCreateOrConnectWithoutOrganizationInput[]
    upsert?: MatchDecisionUpsertWithWhereUniqueWithoutOrganizationInput | MatchDecisionUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: MatchDecisionCreateManyOrganizationInputEnvelope
    set?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    disconnect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    delete?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    connect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    update?: MatchDecisionUpdateWithWhereUniqueWithoutOrganizationInput | MatchDecisionUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: MatchDecisionUpdateManyWithWhereWithoutOrganizationInput | MatchDecisionUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: MatchDecisionScalarWhereInput | MatchDecisionScalarWhereInput[]
  }

  export type YcCompanyUpdateOneWithoutOrganizationNestedInput = {
    create?: XOR<YcCompanyCreateWithoutOrganizationInput, YcCompanyUncheckedCreateWithoutOrganizationInput>
    connectOrCreate?: YcCompanyCreateOrConnectWithoutOrganizationInput
    upsert?: YcCompanyUpsertWithoutOrganizationInput
    disconnect?: YcCompanyWhereInput | boolean
    delete?: YcCompanyWhereInput | boolean
    connect?: YcCompanyWhereUniqueInput
    update?: XOR<XOR<YcCompanyUpdateToOneWithWhereWithoutOrganizationInput, YcCompanyUpdateWithoutOrganizationInput>, YcCompanyUncheckedUpdateWithoutOrganizationInput>
  }

  export type RoleUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<RoleCreateWithoutOrganizationInput, RoleUncheckedCreateWithoutOrganizationInput> | RoleCreateWithoutOrganizationInput[] | RoleUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutOrganizationInput | RoleCreateOrConnectWithoutOrganizationInput[]
    upsert?: RoleUpsertWithWhereUniqueWithoutOrganizationInput | RoleUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: RoleCreateManyOrganizationInputEnvelope
    set?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    disconnect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    delete?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    update?: RoleUpdateWithWhereUniqueWithoutOrganizationInput | RoleUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: RoleUpdateManyWithWhereWithoutOrganizationInput | RoleUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: RoleScalarWhereInput | RoleScalarWhereInput[]
  }

  export type SourceRecordUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<SourceRecordCreateWithoutOrganizationInput, SourceRecordUncheckedCreateWithoutOrganizationInput> | SourceRecordCreateWithoutOrganizationInput[] | SourceRecordUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: SourceRecordCreateOrConnectWithoutOrganizationInput | SourceRecordCreateOrConnectWithoutOrganizationInput[]
    upsert?: SourceRecordUpsertWithWhereUniqueWithoutOrganizationInput | SourceRecordUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: SourceRecordCreateManyOrganizationInputEnvelope
    set?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    disconnect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    delete?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    connect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    update?: SourceRecordUpdateWithWhereUniqueWithoutOrganizationInput | SourceRecordUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: SourceRecordUpdateManyWithWhereWithoutOrganizationInput | SourceRecordUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: SourceRecordScalarWhereInput | SourceRecordScalarWhereInput[]
  }

  export type MatchDecisionUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<MatchDecisionCreateWithoutOrganizationInput, MatchDecisionUncheckedCreateWithoutOrganizationInput> | MatchDecisionCreateWithoutOrganizationInput[] | MatchDecisionUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: MatchDecisionCreateOrConnectWithoutOrganizationInput | MatchDecisionCreateOrConnectWithoutOrganizationInput[]
    upsert?: MatchDecisionUpsertWithWhereUniqueWithoutOrganizationInput | MatchDecisionUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: MatchDecisionCreateManyOrganizationInputEnvelope
    set?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    disconnect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    delete?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    connect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    update?: MatchDecisionUpdateWithWhereUniqueWithoutOrganizationInput | MatchDecisionUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: MatchDecisionUpdateManyWithWhereWithoutOrganizationInput | MatchDecisionUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: MatchDecisionScalarWhereInput | MatchDecisionScalarWhereInput[]
  }

  export type YcCompanyUncheckedUpdateOneWithoutOrganizationNestedInput = {
    create?: XOR<YcCompanyCreateWithoutOrganizationInput, YcCompanyUncheckedCreateWithoutOrganizationInput>
    connectOrCreate?: YcCompanyCreateOrConnectWithoutOrganizationInput
    upsert?: YcCompanyUpsertWithoutOrganizationInput
    disconnect?: YcCompanyWhereInput | boolean
    delete?: YcCompanyWhereInput | boolean
    connect?: YcCompanyWhereUniqueInput
    update?: XOR<XOR<YcCompanyUpdateToOneWithWhereWithoutOrganizationInput, YcCompanyUpdateWithoutOrganizationInput>, YcCompanyUncheckedUpdateWithoutOrganizationInput>
  }

  export type PersonCreateexpertiseInput = {
    set: string[]
  }

  export type PersonCreatesourceIdsInput = {
    set: string[]
  }

  export type RoleCreateNestedManyWithoutPersonInput = {
    create?: XOR<RoleCreateWithoutPersonInput, RoleUncheckedCreateWithoutPersonInput> | RoleCreateWithoutPersonInput[] | RoleUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutPersonInput | RoleCreateOrConnectWithoutPersonInput[]
    createMany?: RoleCreateManyPersonInputEnvelope
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
  }

  export type SourceRecordCreateNestedManyWithoutPersonInput = {
    create?: XOR<SourceRecordCreateWithoutPersonInput, SourceRecordUncheckedCreateWithoutPersonInput> | SourceRecordCreateWithoutPersonInput[] | SourceRecordUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: SourceRecordCreateOrConnectWithoutPersonInput | SourceRecordCreateOrConnectWithoutPersonInput[]
    createMany?: SourceRecordCreateManyPersonInputEnvelope
    connect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
  }

  export type MatchDecisionCreateNestedManyWithoutPersonInput = {
    create?: XOR<MatchDecisionCreateWithoutPersonInput, MatchDecisionUncheckedCreateWithoutPersonInput> | MatchDecisionCreateWithoutPersonInput[] | MatchDecisionUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: MatchDecisionCreateOrConnectWithoutPersonInput | MatchDecisionCreateOrConnectWithoutPersonInput[]
    createMany?: MatchDecisionCreateManyPersonInputEnvelope
    connect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
  }

  export type YcPersonCreateNestedOneWithoutPersonInput = {
    create?: XOR<YcPersonCreateWithoutPersonInput, YcPersonUncheckedCreateWithoutPersonInput>
    connectOrCreate?: YcPersonCreateOrConnectWithoutPersonInput
    connect?: YcPersonWhereUniqueInput
  }

  export type RoleUncheckedCreateNestedManyWithoutPersonInput = {
    create?: XOR<RoleCreateWithoutPersonInput, RoleUncheckedCreateWithoutPersonInput> | RoleCreateWithoutPersonInput[] | RoleUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutPersonInput | RoleCreateOrConnectWithoutPersonInput[]
    createMany?: RoleCreateManyPersonInputEnvelope
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
  }

  export type SourceRecordUncheckedCreateNestedManyWithoutPersonInput = {
    create?: XOR<SourceRecordCreateWithoutPersonInput, SourceRecordUncheckedCreateWithoutPersonInput> | SourceRecordCreateWithoutPersonInput[] | SourceRecordUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: SourceRecordCreateOrConnectWithoutPersonInput | SourceRecordCreateOrConnectWithoutPersonInput[]
    createMany?: SourceRecordCreateManyPersonInputEnvelope
    connect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
  }

  export type MatchDecisionUncheckedCreateNestedManyWithoutPersonInput = {
    create?: XOR<MatchDecisionCreateWithoutPersonInput, MatchDecisionUncheckedCreateWithoutPersonInput> | MatchDecisionCreateWithoutPersonInput[] | MatchDecisionUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: MatchDecisionCreateOrConnectWithoutPersonInput | MatchDecisionCreateOrConnectWithoutPersonInput[]
    createMany?: MatchDecisionCreateManyPersonInputEnvelope
    connect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
  }

  export type YcPersonUncheckedCreateNestedOneWithoutPersonInput = {
    create?: XOR<YcPersonCreateWithoutPersonInput, YcPersonUncheckedCreateWithoutPersonInput>
    connectOrCreate?: YcPersonCreateOrConnectWithoutPersonInput
    connect?: YcPersonWhereUniqueInput
  }

  export type PersonUpdateexpertiseInput = {
    set?: string[]
    push?: string | string[]
  }

  export type PersonUpdatesourceIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type RoleUpdateManyWithoutPersonNestedInput = {
    create?: XOR<RoleCreateWithoutPersonInput, RoleUncheckedCreateWithoutPersonInput> | RoleCreateWithoutPersonInput[] | RoleUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutPersonInput | RoleCreateOrConnectWithoutPersonInput[]
    upsert?: RoleUpsertWithWhereUniqueWithoutPersonInput | RoleUpsertWithWhereUniqueWithoutPersonInput[]
    createMany?: RoleCreateManyPersonInputEnvelope
    set?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    disconnect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    delete?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    update?: RoleUpdateWithWhereUniqueWithoutPersonInput | RoleUpdateWithWhereUniqueWithoutPersonInput[]
    updateMany?: RoleUpdateManyWithWhereWithoutPersonInput | RoleUpdateManyWithWhereWithoutPersonInput[]
    deleteMany?: RoleScalarWhereInput | RoleScalarWhereInput[]
  }

  export type SourceRecordUpdateManyWithoutPersonNestedInput = {
    create?: XOR<SourceRecordCreateWithoutPersonInput, SourceRecordUncheckedCreateWithoutPersonInput> | SourceRecordCreateWithoutPersonInput[] | SourceRecordUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: SourceRecordCreateOrConnectWithoutPersonInput | SourceRecordCreateOrConnectWithoutPersonInput[]
    upsert?: SourceRecordUpsertWithWhereUniqueWithoutPersonInput | SourceRecordUpsertWithWhereUniqueWithoutPersonInput[]
    createMany?: SourceRecordCreateManyPersonInputEnvelope
    set?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    disconnect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    delete?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    connect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    update?: SourceRecordUpdateWithWhereUniqueWithoutPersonInput | SourceRecordUpdateWithWhereUniqueWithoutPersonInput[]
    updateMany?: SourceRecordUpdateManyWithWhereWithoutPersonInput | SourceRecordUpdateManyWithWhereWithoutPersonInput[]
    deleteMany?: SourceRecordScalarWhereInput | SourceRecordScalarWhereInput[]
  }

  export type MatchDecisionUpdateManyWithoutPersonNestedInput = {
    create?: XOR<MatchDecisionCreateWithoutPersonInput, MatchDecisionUncheckedCreateWithoutPersonInput> | MatchDecisionCreateWithoutPersonInput[] | MatchDecisionUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: MatchDecisionCreateOrConnectWithoutPersonInput | MatchDecisionCreateOrConnectWithoutPersonInput[]
    upsert?: MatchDecisionUpsertWithWhereUniqueWithoutPersonInput | MatchDecisionUpsertWithWhereUniqueWithoutPersonInput[]
    createMany?: MatchDecisionCreateManyPersonInputEnvelope
    set?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    disconnect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    delete?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    connect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    update?: MatchDecisionUpdateWithWhereUniqueWithoutPersonInput | MatchDecisionUpdateWithWhereUniqueWithoutPersonInput[]
    updateMany?: MatchDecisionUpdateManyWithWhereWithoutPersonInput | MatchDecisionUpdateManyWithWhereWithoutPersonInput[]
    deleteMany?: MatchDecisionScalarWhereInput | MatchDecisionScalarWhereInput[]
  }

  export type YcPersonUpdateOneWithoutPersonNestedInput = {
    create?: XOR<YcPersonCreateWithoutPersonInput, YcPersonUncheckedCreateWithoutPersonInput>
    connectOrCreate?: YcPersonCreateOrConnectWithoutPersonInput
    upsert?: YcPersonUpsertWithoutPersonInput
    disconnect?: YcPersonWhereInput | boolean
    delete?: YcPersonWhereInput | boolean
    connect?: YcPersonWhereUniqueInput
    update?: XOR<XOR<YcPersonUpdateToOneWithWhereWithoutPersonInput, YcPersonUpdateWithoutPersonInput>, YcPersonUncheckedUpdateWithoutPersonInput>
  }

  export type RoleUncheckedUpdateManyWithoutPersonNestedInput = {
    create?: XOR<RoleCreateWithoutPersonInput, RoleUncheckedCreateWithoutPersonInput> | RoleCreateWithoutPersonInput[] | RoleUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutPersonInput | RoleCreateOrConnectWithoutPersonInput[]
    upsert?: RoleUpsertWithWhereUniqueWithoutPersonInput | RoleUpsertWithWhereUniqueWithoutPersonInput[]
    createMany?: RoleCreateManyPersonInputEnvelope
    set?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    disconnect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    delete?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    update?: RoleUpdateWithWhereUniqueWithoutPersonInput | RoleUpdateWithWhereUniqueWithoutPersonInput[]
    updateMany?: RoleUpdateManyWithWhereWithoutPersonInput | RoleUpdateManyWithWhereWithoutPersonInput[]
    deleteMany?: RoleScalarWhereInput | RoleScalarWhereInput[]
  }

  export type SourceRecordUncheckedUpdateManyWithoutPersonNestedInput = {
    create?: XOR<SourceRecordCreateWithoutPersonInput, SourceRecordUncheckedCreateWithoutPersonInput> | SourceRecordCreateWithoutPersonInput[] | SourceRecordUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: SourceRecordCreateOrConnectWithoutPersonInput | SourceRecordCreateOrConnectWithoutPersonInput[]
    upsert?: SourceRecordUpsertWithWhereUniqueWithoutPersonInput | SourceRecordUpsertWithWhereUniqueWithoutPersonInput[]
    createMany?: SourceRecordCreateManyPersonInputEnvelope
    set?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    disconnect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    delete?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    connect?: SourceRecordWhereUniqueInput | SourceRecordWhereUniqueInput[]
    update?: SourceRecordUpdateWithWhereUniqueWithoutPersonInput | SourceRecordUpdateWithWhereUniqueWithoutPersonInput[]
    updateMany?: SourceRecordUpdateManyWithWhereWithoutPersonInput | SourceRecordUpdateManyWithWhereWithoutPersonInput[]
    deleteMany?: SourceRecordScalarWhereInput | SourceRecordScalarWhereInput[]
  }

  export type MatchDecisionUncheckedUpdateManyWithoutPersonNestedInput = {
    create?: XOR<MatchDecisionCreateWithoutPersonInput, MatchDecisionUncheckedCreateWithoutPersonInput> | MatchDecisionCreateWithoutPersonInput[] | MatchDecisionUncheckedCreateWithoutPersonInput[]
    connectOrCreate?: MatchDecisionCreateOrConnectWithoutPersonInput | MatchDecisionCreateOrConnectWithoutPersonInput[]
    upsert?: MatchDecisionUpsertWithWhereUniqueWithoutPersonInput | MatchDecisionUpsertWithWhereUniqueWithoutPersonInput[]
    createMany?: MatchDecisionCreateManyPersonInputEnvelope
    set?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    disconnect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    delete?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    connect?: MatchDecisionWhereUniqueInput | MatchDecisionWhereUniqueInput[]
    update?: MatchDecisionUpdateWithWhereUniqueWithoutPersonInput | MatchDecisionUpdateWithWhereUniqueWithoutPersonInput[]
    updateMany?: MatchDecisionUpdateManyWithWhereWithoutPersonInput | MatchDecisionUpdateManyWithWhereWithoutPersonInput[]
    deleteMany?: MatchDecisionScalarWhereInput | MatchDecisionScalarWhereInput[]
  }

  export type YcPersonUncheckedUpdateOneWithoutPersonNestedInput = {
    create?: XOR<YcPersonCreateWithoutPersonInput, YcPersonUncheckedCreateWithoutPersonInput>
    connectOrCreate?: YcPersonCreateOrConnectWithoutPersonInput
    upsert?: YcPersonUpsertWithoutPersonInput
    disconnect?: YcPersonWhereInput | boolean
    delete?: YcPersonWhereInput | boolean
    connect?: YcPersonWhereUniqueInput
    update?: XOR<XOR<YcPersonUpdateToOneWithWhereWithoutPersonInput, YcPersonUpdateWithoutPersonInput>, YcPersonUncheckedUpdateWithoutPersonInput>
  }

  export type PersonCreateNestedOneWithoutRolesInput = {
    create?: XOR<PersonCreateWithoutRolesInput, PersonUncheckedCreateWithoutRolesInput>
    connectOrCreate?: PersonCreateOrConnectWithoutRolesInput
    connect?: PersonWhereUniqueInput
  }

  export type OrganizationCreateNestedOneWithoutRolesInput = {
    create?: XOR<OrganizationCreateWithoutRolesInput, OrganizationUncheckedCreateWithoutRolesInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutRolesInput
    connect?: OrganizationWhereUniqueInput
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type PersonUpdateOneRequiredWithoutRolesNestedInput = {
    create?: XOR<PersonCreateWithoutRolesInput, PersonUncheckedCreateWithoutRolesInput>
    connectOrCreate?: PersonCreateOrConnectWithoutRolesInput
    upsert?: PersonUpsertWithoutRolesInput
    connect?: PersonWhereUniqueInput
    update?: XOR<XOR<PersonUpdateToOneWithWhereWithoutRolesInput, PersonUpdateWithoutRolesInput>, PersonUncheckedUpdateWithoutRolesInput>
  }

  export type OrganizationUpdateOneRequiredWithoutRolesNestedInput = {
    create?: XOR<OrganizationCreateWithoutRolesInput, OrganizationUncheckedCreateWithoutRolesInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutRolesInput
    upsert?: OrganizationUpsertWithoutRolesInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutRolesInput, OrganizationUpdateWithoutRolesInput>, OrganizationUncheckedUpdateWithoutRolesInput>
  }

  export type OrganizationCreateNestedOneWithoutSourceRecordsInput = {
    create?: XOR<OrganizationCreateWithoutSourceRecordsInput, OrganizationUncheckedCreateWithoutSourceRecordsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutSourceRecordsInput
    connect?: OrganizationWhereUniqueInput
  }

  export type PersonCreateNestedOneWithoutSourceRecordsInput = {
    create?: XOR<PersonCreateWithoutSourceRecordsInput, PersonUncheckedCreateWithoutSourceRecordsInput>
    connectOrCreate?: PersonCreateOrConnectWithoutSourceRecordsInput
    connect?: PersonWhereUniqueInput
  }

  export type OrganizationUpdateOneWithoutSourceRecordsNestedInput = {
    create?: XOR<OrganizationCreateWithoutSourceRecordsInput, OrganizationUncheckedCreateWithoutSourceRecordsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutSourceRecordsInput
    upsert?: OrganizationUpsertWithoutSourceRecordsInput
    disconnect?: OrganizationWhereInput | boolean
    delete?: OrganizationWhereInput | boolean
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutSourceRecordsInput, OrganizationUpdateWithoutSourceRecordsInput>, OrganizationUncheckedUpdateWithoutSourceRecordsInput>
  }

  export type PersonUpdateOneWithoutSourceRecordsNestedInput = {
    create?: XOR<PersonCreateWithoutSourceRecordsInput, PersonUncheckedCreateWithoutSourceRecordsInput>
    connectOrCreate?: PersonCreateOrConnectWithoutSourceRecordsInput
    upsert?: PersonUpsertWithoutSourceRecordsInput
    disconnect?: PersonWhereInput | boolean
    delete?: PersonWhereInput | boolean
    connect?: PersonWhereUniqueInput
    update?: XOR<XOR<PersonUpdateToOneWithWhereWithoutSourceRecordsInput, PersonUpdateWithoutSourceRecordsInput>, PersonUncheckedUpdateWithoutSourceRecordsInput>
  }

  export type YcCompanyCreateindustriesInput = {
    set: string[]
  }

  export type YcCompanyCreatesubverticalsInput = {
    set: string[]
  }

  export type YcCompanyCreatetagsInput = {
    set: string[]
  }

  export type OrganizationCreateNestedOneWithoutYcCompanyInput = {
    create?: XOR<OrganizationCreateWithoutYcCompanyInput, OrganizationUncheckedCreateWithoutYcCompanyInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutYcCompanyInput
    connect?: OrganizationWhereUniqueInput
  }

  export type YcPersonCreateNestedManyWithoutYcCompanyInput = {
    create?: XOR<YcPersonCreateWithoutYcCompanyInput, YcPersonUncheckedCreateWithoutYcCompanyInput> | YcPersonCreateWithoutYcCompanyInput[] | YcPersonUncheckedCreateWithoutYcCompanyInput[]
    connectOrCreate?: YcPersonCreateOrConnectWithoutYcCompanyInput | YcPersonCreateOrConnectWithoutYcCompanyInput[]
    createMany?: YcPersonCreateManyYcCompanyInputEnvelope
    connect?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
  }

  export type YcPersonUncheckedCreateNestedManyWithoutYcCompanyInput = {
    create?: XOR<YcPersonCreateWithoutYcCompanyInput, YcPersonUncheckedCreateWithoutYcCompanyInput> | YcPersonCreateWithoutYcCompanyInput[] | YcPersonUncheckedCreateWithoutYcCompanyInput[]
    connectOrCreate?: YcPersonCreateOrConnectWithoutYcCompanyInput | YcPersonCreateOrConnectWithoutYcCompanyInput[]
    createMany?: YcPersonCreateManyYcCompanyInputEnvelope
    connect?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
  }

  export type YcCompanyUpdateindustriesInput = {
    set?: string[]
    push?: string | string[]
  }

  export type YcCompanyUpdatesubverticalsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type YcCompanyUpdatetagsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type OrganizationUpdateOneWithoutYcCompanyNestedInput = {
    create?: XOR<OrganizationCreateWithoutYcCompanyInput, OrganizationUncheckedCreateWithoutYcCompanyInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutYcCompanyInput
    upsert?: OrganizationUpsertWithoutYcCompanyInput
    disconnect?: OrganizationWhereInput | boolean
    delete?: OrganizationWhereInput | boolean
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutYcCompanyInput, OrganizationUpdateWithoutYcCompanyInput>, OrganizationUncheckedUpdateWithoutYcCompanyInput>
  }

  export type YcPersonUpdateManyWithoutYcCompanyNestedInput = {
    create?: XOR<YcPersonCreateWithoutYcCompanyInput, YcPersonUncheckedCreateWithoutYcCompanyInput> | YcPersonCreateWithoutYcCompanyInput[] | YcPersonUncheckedCreateWithoutYcCompanyInput[]
    connectOrCreate?: YcPersonCreateOrConnectWithoutYcCompanyInput | YcPersonCreateOrConnectWithoutYcCompanyInput[]
    upsert?: YcPersonUpsertWithWhereUniqueWithoutYcCompanyInput | YcPersonUpsertWithWhereUniqueWithoutYcCompanyInput[]
    createMany?: YcPersonCreateManyYcCompanyInputEnvelope
    set?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
    disconnect?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
    delete?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
    connect?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
    update?: YcPersonUpdateWithWhereUniqueWithoutYcCompanyInput | YcPersonUpdateWithWhereUniqueWithoutYcCompanyInput[]
    updateMany?: YcPersonUpdateManyWithWhereWithoutYcCompanyInput | YcPersonUpdateManyWithWhereWithoutYcCompanyInput[]
    deleteMany?: YcPersonScalarWhereInput | YcPersonScalarWhereInput[]
  }

  export type YcPersonUncheckedUpdateManyWithoutYcCompanyNestedInput = {
    create?: XOR<YcPersonCreateWithoutYcCompanyInput, YcPersonUncheckedCreateWithoutYcCompanyInput> | YcPersonCreateWithoutYcCompanyInput[] | YcPersonUncheckedCreateWithoutYcCompanyInput[]
    connectOrCreate?: YcPersonCreateOrConnectWithoutYcCompanyInput | YcPersonCreateOrConnectWithoutYcCompanyInput[]
    upsert?: YcPersonUpsertWithWhereUniqueWithoutYcCompanyInput | YcPersonUpsertWithWhereUniqueWithoutYcCompanyInput[]
    createMany?: YcPersonCreateManyYcCompanyInputEnvelope
    set?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
    disconnect?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
    delete?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
    connect?: YcPersonWhereUniqueInput | YcPersonWhereUniqueInput[]
    update?: YcPersonUpdateWithWhereUniqueWithoutYcCompanyInput | YcPersonUpdateWithWhereUniqueWithoutYcCompanyInput[]
    updateMany?: YcPersonUpdateManyWithWhereWithoutYcCompanyInput | YcPersonUpdateManyWithWhereWithoutYcCompanyInput[]
    deleteMany?: YcPersonScalarWhereInput | YcPersonScalarWhereInput[]
  }

  export type YcCompanyCreateNestedOneWithoutYcPersonsInput = {
    create?: XOR<YcCompanyCreateWithoutYcPersonsInput, YcCompanyUncheckedCreateWithoutYcPersonsInput>
    connectOrCreate?: YcCompanyCreateOrConnectWithoutYcPersonsInput
    connect?: YcCompanyWhereUniqueInput
  }

  export type PersonCreateNestedOneWithoutYcPersonInput = {
    create?: XOR<PersonCreateWithoutYcPersonInput, PersonUncheckedCreateWithoutYcPersonInput>
    connectOrCreate?: PersonCreateOrConnectWithoutYcPersonInput
    connect?: PersonWhereUniqueInput
  }

  export type YcCompanyUpdateOneWithoutYcPersonsNestedInput = {
    create?: XOR<YcCompanyCreateWithoutYcPersonsInput, YcCompanyUncheckedCreateWithoutYcPersonsInput>
    connectOrCreate?: YcCompanyCreateOrConnectWithoutYcPersonsInput
    upsert?: YcCompanyUpsertWithoutYcPersonsInput
    disconnect?: YcCompanyWhereInput | boolean
    delete?: YcCompanyWhereInput | boolean
    connect?: YcCompanyWhereUniqueInput
    update?: XOR<XOR<YcCompanyUpdateToOneWithWhereWithoutYcPersonsInput, YcCompanyUpdateWithoutYcPersonsInput>, YcCompanyUncheckedUpdateWithoutYcPersonsInput>
  }

  export type PersonUpdateOneWithoutYcPersonNestedInput = {
    create?: XOR<PersonCreateWithoutYcPersonInput, PersonUncheckedCreateWithoutYcPersonInput>
    connectOrCreate?: PersonCreateOrConnectWithoutYcPersonInput
    upsert?: PersonUpsertWithoutYcPersonInput
    disconnect?: PersonWhereInput | boolean
    delete?: PersonWhereInput | boolean
    connect?: PersonWhereUniqueInput
    update?: XOR<XOR<PersonUpdateToOneWithWhereWithoutYcPersonInput, PersonUpdateWithoutYcPersonInput>, PersonUncheckedUpdateWithoutYcPersonInput>
  }

  export type MatchDecisionCreatecandidateIdsInput = {
    set: string[]
  }

  export type OrganizationCreateNestedOneWithoutMatchDecisionsInput = {
    create?: XOR<OrganizationCreateWithoutMatchDecisionsInput, OrganizationUncheckedCreateWithoutMatchDecisionsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutMatchDecisionsInput
    connect?: OrganizationWhereUniqueInput
  }

  export type PersonCreateNestedOneWithoutMatchDecisionsInput = {
    create?: XOR<PersonCreateWithoutMatchDecisionsInput, PersonUncheckedCreateWithoutMatchDecisionsInput>
    connectOrCreate?: PersonCreateOrConnectWithoutMatchDecisionsInput
    connect?: PersonWhereUniqueInput
  }

  export type MatchDecisionUpdatecandidateIdsInput = {
    set?: string[]
    push?: string | string[]
  }

  export type FloatFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type OrganizationUpdateOneWithoutMatchDecisionsNestedInput = {
    create?: XOR<OrganizationCreateWithoutMatchDecisionsInput, OrganizationUncheckedCreateWithoutMatchDecisionsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutMatchDecisionsInput
    upsert?: OrganizationUpsertWithoutMatchDecisionsInput
    disconnect?: OrganizationWhereInput | boolean
    delete?: OrganizationWhereInput | boolean
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutMatchDecisionsInput, OrganizationUpdateWithoutMatchDecisionsInput>, OrganizationUncheckedUpdateWithoutMatchDecisionsInput>
  }

  export type PersonUpdateOneWithoutMatchDecisionsNestedInput = {
    create?: XOR<PersonCreateWithoutMatchDecisionsInput, PersonUncheckedCreateWithoutMatchDecisionsInput>
    connectOrCreate?: PersonCreateOrConnectWithoutMatchDecisionsInput
    upsert?: PersonUpsertWithoutMatchDecisionsInput
    disconnect?: PersonWhereInput | boolean
    delete?: PersonWhereInput | boolean
    connect?: PersonWhereUniqueInput
    update?: XOR<XOR<PersonUpdateToOneWithWhereWithoutMatchDecisionsInput, PersonUpdateWithoutMatchDecisionsInput>, PersonUncheckedUpdateWithoutMatchDecisionsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }
  export type NestedJsonFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type RoleCreateWithoutOrganizationInput = {
    id?: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    person: PersonCreateNestedOneWithoutRolesInput
  }

  export type RoleUncheckedCreateWithoutOrganizationInput = {
    id?: string
    personId: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type RoleCreateOrConnectWithoutOrganizationInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutOrganizationInput, RoleUncheckedCreateWithoutOrganizationInput>
  }

  export type RoleCreateManyOrganizationInputEnvelope = {
    data: RoleCreateManyOrganizationInput | RoleCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type SourceRecordCreateWithoutOrganizationInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    person?: PersonCreateNestedOneWithoutSourceRecordsInput
  }

  export type SourceRecordUncheckedCreateWithoutOrganizationInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    personId?: string | null
  }

  export type SourceRecordCreateOrConnectWithoutOrganizationInput = {
    where: SourceRecordWhereUniqueInput
    create: XOR<SourceRecordCreateWithoutOrganizationInput, SourceRecordUncheckedCreateWithoutOrganizationInput>
  }

  export type SourceRecordCreateManyOrganizationInputEnvelope = {
    data: SourceRecordCreateManyOrganizationInput | SourceRecordCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type MatchDecisionCreateWithoutOrganizationInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    person?: PersonCreateNestedOneWithoutMatchDecisionsInput
  }

  export type MatchDecisionUncheckedCreateWithoutOrganizationInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    personId?: string | null
    createdAt?: Date | string
  }

  export type MatchDecisionCreateOrConnectWithoutOrganizationInput = {
    where: MatchDecisionWhereUniqueInput
    create: XOR<MatchDecisionCreateWithoutOrganizationInput, MatchDecisionUncheckedCreateWithoutOrganizationInput>
  }

  export type MatchDecisionCreateManyOrganizationInputEnvelope = {
    data: MatchDecisionCreateManyOrganizationInput | MatchDecisionCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type YcCompanyCreateWithoutOrganizationInput = {
    id?: string
    ycId: string
    slug: string
    name: string
    batch: string
    status?: string | null
    website?: string | null
    description?: string | null
    longDescription?: string | null
    teamSize?: number | null
    allLocations?: string | null
    industries?: YcCompanyCreateindustriesInput | string[]
    subverticals?: YcCompanyCreatesubverticalsInput | string[]
    tags?: YcCompanyCreatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    ycPersons?: YcPersonCreateNestedManyWithoutYcCompanyInput
  }

  export type YcCompanyUncheckedCreateWithoutOrganizationInput = {
    id?: string
    ycId: string
    slug: string
    name: string
    batch: string
    status?: string | null
    website?: string | null
    description?: string | null
    longDescription?: string | null
    teamSize?: number | null
    allLocations?: string | null
    industries?: YcCompanyCreateindustriesInput | string[]
    subverticals?: YcCompanyCreatesubverticalsInput | string[]
    tags?: YcCompanyCreatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    ycPersons?: YcPersonUncheckedCreateNestedManyWithoutYcCompanyInput
  }

  export type YcCompanyCreateOrConnectWithoutOrganizationInput = {
    where: YcCompanyWhereUniqueInput
    create: XOR<YcCompanyCreateWithoutOrganizationInput, YcCompanyUncheckedCreateWithoutOrganizationInput>
  }

  export type RoleUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: RoleWhereUniqueInput
    update: XOR<RoleUpdateWithoutOrganizationInput, RoleUncheckedUpdateWithoutOrganizationInput>
    create: XOR<RoleCreateWithoutOrganizationInput, RoleUncheckedCreateWithoutOrganizationInput>
  }

  export type RoleUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: RoleWhereUniqueInput
    data: XOR<RoleUpdateWithoutOrganizationInput, RoleUncheckedUpdateWithoutOrganizationInput>
  }

  export type RoleUpdateManyWithWhereWithoutOrganizationInput = {
    where: RoleScalarWhereInput
    data: XOR<RoleUpdateManyMutationInput, RoleUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type RoleScalarWhereInput = {
    AND?: RoleScalarWhereInput | RoleScalarWhereInput[]
    OR?: RoleScalarWhereInput[]
    NOT?: RoleScalarWhereInput | RoleScalarWhereInput[]
    id?: StringFilter<"Role"> | string
    personId?: StringFilter<"Role"> | string
    organizationId?: StringFilter<"Role"> | string
    title?: StringNullableFilter<"Role"> | string | null
    roleType?: StringNullableFilter<"Role"> | string | null
    functionType?: StringNullableFilter<"Role"> | string | null
    isCurrent?: BoolFilter<"Role"> | boolean
    startDate?: DateTimeNullableFilter<"Role"> | Date | string | null
    endDate?: DateTimeNullableFilter<"Role"> | Date | string | null
    createdAt?: DateTimeFilter<"Role"> | Date | string
    updatedAt?: DateTimeFilter<"Role"> | Date | string
  }

  export type SourceRecordUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: SourceRecordWhereUniqueInput
    update: XOR<SourceRecordUpdateWithoutOrganizationInput, SourceRecordUncheckedUpdateWithoutOrganizationInput>
    create: XOR<SourceRecordCreateWithoutOrganizationInput, SourceRecordUncheckedCreateWithoutOrganizationInput>
  }

  export type SourceRecordUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: SourceRecordWhereUniqueInput
    data: XOR<SourceRecordUpdateWithoutOrganizationInput, SourceRecordUncheckedUpdateWithoutOrganizationInput>
  }

  export type SourceRecordUpdateManyWithWhereWithoutOrganizationInput = {
    where: SourceRecordScalarWhereInput
    data: XOR<SourceRecordUpdateManyMutationInput, SourceRecordUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type SourceRecordScalarWhereInput = {
    AND?: SourceRecordScalarWhereInput | SourceRecordScalarWhereInput[]
    OR?: SourceRecordScalarWhereInput[]
    NOT?: SourceRecordScalarWhereInput | SourceRecordScalarWhereInput[]
    id?: StringFilter<"SourceRecord"> | string
    sourceAdapter?: StringFilter<"SourceRecord"> | string
    sourceUrl?: StringFilter<"SourceRecord"> | string
    sourceId?: StringNullableFilter<"SourceRecord"> | string | null
    rawPayload?: JsonFilter<"SourceRecord">
    entityType?: StringFilter<"SourceRecord"> | string
    fetchedAt?: DateTimeFilter<"SourceRecord"> | Date | string
    normalizedAt?: DateTimeNullableFilter<"SourceRecord"> | Date | string | null
    organizationId?: StringNullableFilter<"SourceRecord"> | string | null
    personId?: StringNullableFilter<"SourceRecord"> | string | null
  }

  export type MatchDecisionUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: MatchDecisionWhereUniqueInput
    update: XOR<MatchDecisionUpdateWithoutOrganizationInput, MatchDecisionUncheckedUpdateWithoutOrganizationInput>
    create: XOR<MatchDecisionCreateWithoutOrganizationInput, MatchDecisionUncheckedCreateWithoutOrganizationInput>
  }

  export type MatchDecisionUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: MatchDecisionWhereUniqueInput
    data: XOR<MatchDecisionUpdateWithoutOrganizationInput, MatchDecisionUncheckedUpdateWithoutOrganizationInput>
  }

  export type MatchDecisionUpdateManyWithWhereWithoutOrganizationInput = {
    where: MatchDecisionScalarWhereInput
    data: XOR<MatchDecisionUpdateManyMutationInput, MatchDecisionUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type MatchDecisionScalarWhereInput = {
    AND?: MatchDecisionScalarWhereInput | MatchDecisionScalarWhereInput[]
    OR?: MatchDecisionScalarWhereInput[]
    NOT?: MatchDecisionScalarWhereInput | MatchDecisionScalarWhereInput[]
    id?: StringFilter<"MatchDecision"> | string
    entityType?: StringFilter<"MatchDecision"> | string
    candidateIds?: StringNullableListFilter<"MatchDecision">
    selectedId?: StringNullableFilter<"MatchDecision"> | string | null
    matchRuleUsed?: StringFilter<"MatchDecision"> | string
    confidenceScore?: FloatFilter<"MatchDecision"> | number
    decisionType?: StringFilter<"MatchDecision"> | string
    resolverVersion?: StringFilter<"MatchDecision"> | string
    metadata?: JsonNullableFilter<"MatchDecision">
    organizationId?: StringNullableFilter<"MatchDecision"> | string | null
    personId?: StringNullableFilter<"MatchDecision"> | string | null
    createdAt?: DateTimeFilter<"MatchDecision"> | Date | string
  }

  export type YcCompanyUpsertWithoutOrganizationInput = {
    update: XOR<YcCompanyUpdateWithoutOrganizationInput, YcCompanyUncheckedUpdateWithoutOrganizationInput>
    create: XOR<YcCompanyCreateWithoutOrganizationInput, YcCompanyUncheckedCreateWithoutOrganizationInput>
    where?: YcCompanyWhereInput
  }

  export type YcCompanyUpdateToOneWithWhereWithoutOrganizationInput = {
    where?: YcCompanyWhereInput
    data: XOR<YcCompanyUpdateWithoutOrganizationInput, YcCompanyUncheckedUpdateWithoutOrganizationInput>
  }

  export type YcCompanyUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    batch?: StringFieldUpdateOperationsInput | string
    status?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    longDescription?: NullableStringFieldUpdateOperationsInput | string | null
    teamSize?: NullableIntFieldUpdateOperationsInput | number | null
    allLocations?: NullableStringFieldUpdateOperationsInput | string | null
    industries?: YcCompanyUpdateindustriesInput | string[]
    subverticals?: YcCompanyUpdatesubverticalsInput | string[]
    tags?: YcCompanyUpdatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ycPersons?: YcPersonUpdateManyWithoutYcCompanyNestedInput
  }

  export type YcCompanyUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    batch?: StringFieldUpdateOperationsInput | string
    status?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    longDescription?: NullableStringFieldUpdateOperationsInput | string | null
    teamSize?: NullableIntFieldUpdateOperationsInput | number | null
    allLocations?: NullableStringFieldUpdateOperationsInput | string | null
    industries?: YcCompanyUpdateindustriesInput | string[]
    subverticals?: YcCompanyUpdatesubverticalsInput | string[]
    tags?: YcCompanyUpdatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ycPersons?: YcPersonUncheckedUpdateManyWithoutYcCompanyNestedInput
  }

  export type RoleCreateWithoutPersonInput = {
    id?: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    organization: OrganizationCreateNestedOneWithoutRolesInput
  }

  export type RoleUncheckedCreateWithoutPersonInput = {
    id?: string
    organizationId: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type RoleCreateOrConnectWithoutPersonInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutPersonInput, RoleUncheckedCreateWithoutPersonInput>
  }

  export type RoleCreateManyPersonInputEnvelope = {
    data: RoleCreateManyPersonInput | RoleCreateManyPersonInput[]
    skipDuplicates?: boolean
  }

  export type SourceRecordCreateWithoutPersonInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    organization?: OrganizationCreateNestedOneWithoutSourceRecordsInput
  }

  export type SourceRecordUncheckedCreateWithoutPersonInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    organizationId?: string | null
  }

  export type SourceRecordCreateOrConnectWithoutPersonInput = {
    where: SourceRecordWhereUniqueInput
    create: XOR<SourceRecordCreateWithoutPersonInput, SourceRecordUncheckedCreateWithoutPersonInput>
  }

  export type SourceRecordCreateManyPersonInputEnvelope = {
    data: SourceRecordCreateManyPersonInput | SourceRecordCreateManyPersonInput[]
    skipDuplicates?: boolean
  }

  export type MatchDecisionCreateWithoutPersonInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    organization?: OrganizationCreateNestedOneWithoutMatchDecisionsInput
  }

  export type MatchDecisionUncheckedCreateWithoutPersonInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    organizationId?: string | null
    createdAt?: Date | string
  }

  export type MatchDecisionCreateOrConnectWithoutPersonInput = {
    where: MatchDecisionWhereUniqueInput
    create: XOR<MatchDecisionCreateWithoutPersonInput, MatchDecisionUncheckedCreateWithoutPersonInput>
  }

  export type MatchDecisionCreateManyPersonInputEnvelope = {
    data: MatchDecisionCreateManyPersonInput | MatchDecisionCreateManyPersonInput[]
    skipDuplicates?: boolean
  }

  export type YcPersonCreateWithoutPersonInput = {
    id?: string
    ycId: string
    name: string
    role?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    ycCompany?: YcCompanyCreateNestedOneWithoutYcPersonsInput
  }

  export type YcPersonUncheckedCreateWithoutPersonInput = {
    id?: string
    ycId: string
    name: string
    role?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    ycCompanyId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type YcPersonCreateOrConnectWithoutPersonInput = {
    where: YcPersonWhereUniqueInput
    create: XOR<YcPersonCreateWithoutPersonInput, YcPersonUncheckedCreateWithoutPersonInput>
  }

  export type RoleUpsertWithWhereUniqueWithoutPersonInput = {
    where: RoleWhereUniqueInput
    update: XOR<RoleUpdateWithoutPersonInput, RoleUncheckedUpdateWithoutPersonInput>
    create: XOR<RoleCreateWithoutPersonInput, RoleUncheckedCreateWithoutPersonInput>
  }

  export type RoleUpdateWithWhereUniqueWithoutPersonInput = {
    where: RoleWhereUniqueInput
    data: XOR<RoleUpdateWithoutPersonInput, RoleUncheckedUpdateWithoutPersonInput>
  }

  export type RoleUpdateManyWithWhereWithoutPersonInput = {
    where: RoleScalarWhereInput
    data: XOR<RoleUpdateManyMutationInput, RoleUncheckedUpdateManyWithoutPersonInput>
  }

  export type SourceRecordUpsertWithWhereUniqueWithoutPersonInput = {
    where: SourceRecordWhereUniqueInput
    update: XOR<SourceRecordUpdateWithoutPersonInput, SourceRecordUncheckedUpdateWithoutPersonInput>
    create: XOR<SourceRecordCreateWithoutPersonInput, SourceRecordUncheckedCreateWithoutPersonInput>
  }

  export type SourceRecordUpdateWithWhereUniqueWithoutPersonInput = {
    where: SourceRecordWhereUniqueInput
    data: XOR<SourceRecordUpdateWithoutPersonInput, SourceRecordUncheckedUpdateWithoutPersonInput>
  }

  export type SourceRecordUpdateManyWithWhereWithoutPersonInput = {
    where: SourceRecordScalarWhereInput
    data: XOR<SourceRecordUpdateManyMutationInput, SourceRecordUncheckedUpdateManyWithoutPersonInput>
  }

  export type MatchDecisionUpsertWithWhereUniqueWithoutPersonInput = {
    where: MatchDecisionWhereUniqueInput
    update: XOR<MatchDecisionUpdateWithoutPersonInput, MatchDecisionUncheckedUpdateWithoutPersonInput>
    create: XOR<MatchDecisionCreateWithoutPersonInput, MatchDecisionUncheckedCreateWithoutPersonInput>
  }

  export type MatchDecisionUpdateWithWhereUniqueWithoutPersonInput = {
    where: MatchDecisionWhereUniqueInput
    data: XOR<MatchDecisionUpdateWithoutPersonInput, MatchDecisionUncheckedUpdateWithoutPersonInput>
  }

  export type MatchDecisionUpdateManyWithWhereWithoutPersonInput = {
    where: MatchDecisionScalarWhereInput
    data: XOR<MatchDecisionUpdateManyMutationInput, MatchDecisionUncheckedUpdateManyWithoutPersonInput>
  }

  export type YcPersonUpsertWithoutPersonInput = {
    update: XOR<YcPersonUpdateWithoutPersonInput, YcPersonUncheckedUpdateWithoutPersonInput>
    create: XOR<YcPersonCreateWithoutPersonInput, YcPersonUncheckedCreateWithoutPersonInput>
    where?: YcPersonWhereInput
  }

  export type YcPersonUpdateToOneWithWhereWithoutPersonInput = {
    where?: YcPersonWhereInput
    data: XOR<YcPersonUpdateWithoutPersonInput, YcPersonUncheckedUpdateWithoutPersonInput>
  }

  export type YcPersonUpdateWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ycCompany?: YcCompanyUpdateOneWithoutYcPersonsNestedInput
  }

  export type YcPersonUncheckedUpdateWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    ycCompanyId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PersonCreateWithoutRolesInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    sourceRecords?: SourceRecordCreateNestedManyWithoutPersonInput
    matchDecisions?: MatchDecisionCreateNestedManyWithoutPersonInput
    ycPerson?: YcPersonCreateNestedOneWithoutPersonInput
  }

  export type PersonUncheckedCreateWithoutRolesInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    sourceRecords?: SourceRecordUncheckedCreateNestedManyWithoutPersonInput
    matchDecisions?: MatchDecisionUncheckedCreateNestedManyWithoutPersonInput
    ycPerson?: YcPersonUncheckedCreateNestedOneWithoutPersonInput
  }

  export type PersonCreateOrConnectWithoutRolesInput = {
    where: PersonWhereUniqueInput
    create: XOR<PersonCreateWithoutRolesInput, PersonUncheckedCreateWithoutRolesInput>
  }

  export type OrganizationCreateWithoutRolesInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    sourceRecords?: SourceRecordCreateNestedManyWithoutOrganizationInput
    matchDecisions?: MatchDecisionCreateNestedManyWithoutOrganizationInput
    ycCompany?: YcCompanyCreateNestedOneWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutRolesInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    sourceRecords?: SourceRecordUncheckedCreateNestedManyWithoutOrganizationInput
    matchDecisions?: MatchDecisionUncheckedCreateNestedManyWithoutOrganizationInput
    ycCompany?: YcCompanyUncheckedCreateNestedOneWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutRolesInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutRolesInput, OrganizationUncheckedCreateWithoutRolesInput>
  }

  export type PersonUpsertWithoutRolesInput = {
    update: XOR<PersonUpdateWithoutRolesInput, PersonUncheckedUpdateWithoutRolesInput>
    create: XOR<PersonCreateWithoutRolesInput, PersonUncheckedCreateWithoutRolesInput>
    where?: PersonWhereInput
  }

  export type PersonUpdateToOneWithWhereWithoutRolesInput = {
    where?: PersonWhereInput
    data: XOR<PersonUpdateWithoutRolesInput, PersonUncheckedUpdateWithoutRolesInput>
  }

  export type PersonUpdateWithoutRolesInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sourceRecords?: SourceRecordUpdateManyWithoutPersonNestedInput
    matchDecisions?: MatchDecisionUpdateManyWithoutPersonNestedInput
    ycPerson?: YcPersonUpdateOneWithoutPersonNestedInput
  }

  export type PersonUncheckedUpdateWithoutRolesInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sourceRecords?: SourceRecordUncheckedUpdateManyWithoutPersonNestedInput
    matchDecisions?: MatchDecisionUncheckedUpdateManyWithoutPersonNestedInput
    ycPerson?: YcPersonUncheckedUpdateOneWithoutPersonNestedInput
  }

  export type OrganizationUpsertWithoutRolesInput = {
    update: XOR<OrganizationUpdateWithoutRolesInput, OrganizationUncheckedUpdateWithoutRolesInput>
    create: XOR<OrganizationCreateWithoutRolesInput, OrganizationUncheckedCreateWithoutRolesInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutRolesInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutRolesInput, OrganizationUncheckedUpdateWithoutRolesInput>
  }

  export type OrganizationUpdateWithoutRolesInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sourceRecords?: SourceRecordUpdateManyWithoutOrganizationNestedInput
    matchDecisions?: MatchDecisionUpdateManyWithoutOrganizationNestedInput
    ycCompany?: YcCompanyUpdateOneWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutRolesInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sourceRecords?: SourceRecordUncheckedUpdateManyWithoutOrganizationNestedInput
    matchDecisions?: MatchDecisionUncheckedUpdateManyWithoutOrganizationNestedInput
    ycCompany?: YcCompanyUncheckedUpdateOneWithoutOrganizationNestedInput
  }

  export type OrganizationCreateWithoutSourceRecordsInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleCreateNestedManyWithoutOrganizationInput
    matchDecisions?: MatchDecisionCreateNestedManyWithoutOrganizationInput
    ycCompany?: YcCompanyCreateNestedOneWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutSourceRecordsInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleUncheckedCreateNestedManyWithoutOrganizationInput
    matchDecisions?: MatchDecisionUncheckedCreateNestedManyWithoutOrganizationInput
    ycCompany?: YcCompanyUncheckedCreateNestedOneWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutSourceRecordsInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutSourceRecordsInput, OrganizationUncheckedCreateWithoutSourceRecordsInput>
  }

  export type PersonCreateWithoutSourceRecordsInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleCreateNestedManyWithoutPersonInput
    matchDecisions?: MatchDecisionCreateNestedManyWithoutPersonInput
    ycPerson?: YcPersonCreateNestedOneWithoutPersonInput
  }

  export type PersonUncheckedCreateWithoutSourceRecordsInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleUncheckedCreateNestedManyWithoutPersonInput
    matchDecisions?: MatchDecisionUncheckedCreateNestedManyWithoutPersonInput
    ycPerson?: YcPersonUncheckedCreateNestedOneWithoutPersonInput
  }

  export type PersonCreateOrConnectWithoutSourceRecordsInput = {
    where: PersonWhereUniqueInput
    create: XOR<PersonCreateWithoutSourceRecordsInput, PersonUncheckedCreateWithoutSourceRecordsInput>
  }

  export type OrganizationUpsertWithoutSourceRecordsInput = {
    update: XOR<OrganizationUpdateWithoutSourceRecordsInput, OrganizationUncheckedUpdateWithoutSourceRecordsInput>
    create: XOR<OrganizationCreateWithoutSourceRecordsInput, OrganizationUncheckedCreateWithoutSourceRecordsInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutSourceRecordsInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutSourceRecordsInput, OrganizationUncheckedUpdateWithoutSourceRecordsInput>
  }

  export type OrganizationUpdateWithoutSourceRecordsInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUpdateManyWithoutOrganizationNestedInput
    matchDecisions?: MatchDecisionUpdateManyWithoutOrganizationNestedInput
    ycCompany?: YcCompanyUpdateOneWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutSourceRecordsInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUncheckedUpdateManyWithoutOrganizationNestedInput
    matchDecisions?: MatchDecisionUncheckedUpdateManyWithoutOrganizationNestedInput
    ycCompany?: YcCompanyUncheckedUpdateOneWithoutOrganizationNestedInput
  }

  export type PersonUpsertWithoutSourceRecordsInput = {
    update: XOR<PersonUpdateWithoutSourceRecordsInput, PersonUncheckedUpdateWithoutSourceRecordsInput>
    create: XOR<PersonCreateWithoutSourceRecordsInput, PersonUncheckedCreateWithoutSourceRecordsInput>
    where?: PersonWhereInput
  }

  export type PersonUpdateToOneWithWhereWithoutSourceRecordsInput = {
    where?: PersonWhereInput
    data: XOR<PersonUpdateWithoutSourceRecordsInput, PersonUncheckedUpdateWithoutSourceRecordsInput>
  }

  export type PersonUpdateWithoutSourceRecordsInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUpdateManyWithoutPersonNestedInput
    matchDecisions?: MatchDecisionUpdateManyWithoutPersonNestedInput
    ycPerson?: YcPersonUpdateOneWithoutPersonNestedInput
  }

  export type PersonUncheckedUpdateWithoutSourceRecordsInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUncheckedUpdateManyWithoutPersonNestedInput
    matchDecisions?: MatchDecisionUncheckedUpdateManyWithoutPersonNestedInput
    ycPerson?: YcPersonUncheckedUpdateOneWithoutPersonNestedInput
  }

  export type OrganizationCreateWithoutYcCompanyInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleCreateNestedManyWithoutOrganizationInput
    sourceRecords?: SourceRecordCreateNestedManyWithoutOrganizationInput
    matchDecisions?: MatchDecisionCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutYcCompanyInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleUncheckedCreateNestedManyWithoutOrganizationInput
    sourceRecords?: SourceRecordUncheckedCreateNestedManyWithoutOrganizationInput
    matchDecisions?: MatchDecisionUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutYcCompanyInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutYcCompanyInput, OrganizationUncheckedCreateWithoutYcCompanyInput>
  }

  export type YcPersonCreateWithoutYcCompanyInput = {
    id?: string
    ycId: string
    name: string
    role?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    person?: PersonCreateNestedOneWithoutYcPersonInput
  }

  export type YcPersonUncheckedCreateWithoutYcCompanyInput = {
    id?: string
    ycId: string
    name: string
    role?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    personId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type YcPersonCreateOrConnectWithoutYcCompanyInput = {
    where: YcPersonWhereUniqueInput
    create: XOR<YcPersonCreateWithoutYcCompanyInput, YcPersonUncheckedCreateWithoutYcCompanyInput>
  }

  export type YcPersonCreateManyYcCompanyInputEnvelope = {
    data: YcPersonCreateManyYcCompanyInput | YcPersonCreateManyYcCompanyInput[]
    skipDuplicates?: boolean
  }

  export type OrganizationUpsertWithoutYcCompanyInput = {
    update: XOR<OrganizationUpdateWithoutYcCompanyInput, OrganizationUncheckedUpdateWithoutYcCompanyInput>
    create: XOR<OrganizationCreateWithoutYcCompanyInput, OrganizationUncheckedCreateWithoutYcCompanyInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutYcCompanyInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutYcCompanyInput, OrganizationUncheckedUpdateWithoutYcCompanyInput>
  }

  export type OrganizationUpdateWithoutYcCompanyInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUpdateManyWithoutOrganizationNestedInput
    sourceRecords?: SourceRecordUpdateManyWithoutOrganizationNestedInput
    matchDecisions?: MatchDecisionUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutYcCompanyInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUncheckedUpdateManyWithoutOrganizationNestedInput
    sourceRecords?: SourceRecordUncheckedUpdateManyWithoutOrganizationNestedInput
    matchDecisions?: MatchDecisionUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type YcPersonUpsertWithWhereUniqueWithoutYcCompanyInput = {
    where: YcPersonWhereUniqueInput
    update: XOR<YcPersonUpdateWithoutYcCompanyInput, YcPersonUncheckedUpdateWithoutYcCompanyInput>
    create: XOR<YcPersonCreateWithoutYcCompanyInput, YcPersonUncheckedCreateWithoutYcCompanyInput>
  }

  export type YcPersonUpdateWithWhereUniqueWithoutYcCompanyInput = {
    where: YcPersonWhereUniqueInput
    data: XOR<YcPersonUpdateWithoutYcCompanyInput, YcPersonUncheckedUpdateWithoutYcCompanyInput>
  }

  export type YcPersonUpdateManyWithWhereWithoutYcCompanyInput = {
    where: YcPersonScalarWhereInput
    data: XOR<YcPersonUpdateManyMutationInput, YcPersonUncheckedUpdateManyWithoutYcCompanyInput>
  }

  export type YcPersonScalarWhereInput = {
    AND?: YcPersonScalarWhereInput | YcPersonScalarWhereInput[]
    OR?: YcPersonScalarWhereInput[]
    NOT?: YcPersonScalarWhereInput | YcPersonScalarWhereInput[]
    id?: StringFilter<"YcPerson"> | string
    ycId?: StringFilter<"YcPerson"> | string
    name?: StringFilter<"YcPerson"> | string
    role?: StringNullableFilter<"YcPerson"> | string | null
    linkedinUrl?: StringNullableFilter<"YcPerson"> | string | null
    twitterUrl?: StringNullableFilter<"YcPerson"> | string | null
    avatarUrl?: StringNullableFilter<"YcPerson"> | string | null
    bio?: StringNullableFilter<"YcPerson"> | string | null
    ycCompanyId?: StringNullableFilter<"YcPerson"> | string | null
    personId?: StringNullableFilter<"YcPerson"> | string | null
    createdAt?: DateTimeFilter<"YcPerson"> | Date | string
    updatedAt?: DateTimeFilter<"YcPerson"> | Date | string
  }

  export type YcCompanyCreateWithoutYcPersonsInput = {
    id?: string
    ycId: string
    slug: string
    name: string
    batch: string
    status?: string | null
    website?: string | null
    description?: string | null
    longDescription?: string | null
    teamSize?: number | null
    allLocations?: string | null
    industries?: YcCompanyCreateindustriesInput | string[]
    subverticals?: YcCompanyCreatesubverticalsInput | string[]
    tags?: YcCompanyCreatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    organization?: OrganizationCreateNestedOneWithoutYcCompanyInput
  }

  export type YcCompanyUncheckedCreateWithoutYcPersonsInput = {
    id?: string
    ycId: string
    slug: string
    name: string
    batch: string
    status?: string | null
    website?: string | null
    description?: string | null
    longDescription?: string | null
    teamSize?: number | null
    allLocations?: string | null
    industries?: YcCompanyCreateindustriesInput | string[]
    subverticals?: YcCompanyCreatesubverticalsInput | string[]
    tags?: YcCompanyCreatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson: JsonNullValueInput | InputJsonValue
    organizationId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type YcCompanyCreateOrConnectWithoutYcPersonsInput = {
    where: YcCompanyWhereUniqueInput
    create: XOR<YcCompanyCreateWithoutYcPersonsInput, YcCompanyUncheckedCreateWithoutYcPersonsInput>
  }

  export type PersonCreateWithoutYcPersonInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleCreateNestedManyWithoutPersonInput
    sourceRecords?: SourceRecordCreateNestedManyWithoutPersonInput
    matchDecisions?: MatchDecisionCreateNestedManyWithoutPersonInput
  }

  export type PersonUncheckedCreateWithoutYcPersonInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleUncheckedCreateNestedManyWithoutPersonInput
    sourceRecords?: SourceRecordUncheckedCreateNestedManyWithoutPersonInput
    matchDecisions?: MatchDecisionUncheckedCreateNestedManyWithoutPersonInput
  }

  export type PersonCreateOrConnectWithoutYcPersonInput = {
    where: PersonWhereUniqueInput
    create: XOR<PersonCreateWithoutYcPersonInput, PersonUncheckedCreateWithoutYcPersonInput>
  }

  export type YcCompanyUpsertWithoutYcPersonsInput = {
    update: XOR<YcCompanyUpdateWithoutYcPersonsInput, YcCompanyUncheckedUpdateWithoutYcPersonsInput>
    create: XOR<YcCompanyCreateWithoutYcPersonsInput, YcCompanyUncheckedCreateWithoutYcPersonsInput>
    where?: YcCompanyWhereInput
  }

  export type YcCompanyUpdateToOneWithWhereWithoutYcPersonsInput = {
    where?: YcCompanyWhereInput
    data: XOR<YcCompanyUpdateWithoutYcPersonsInput, YcCompanyUncheckedUpdateWithoutYcPersonsInput>
  }

  export type YcCompanyUpdateWithoutYcPersonsInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    batch?: StringFieldUpdateOperationsInput | string
    status?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    longDescription?: NullableStringFieldUpdateOperationsInput | string | null
    teamSize?: NullableIntFieldUpdateOperationsInput | number | null
    allLocations?: NullableStringFieldUpdateOperationsInput | string | null
    industries?: YcCompanyUpdateindustriesInput | string[]
    subverticals?: YcCompanyUpdatesubverticalsInput | string[]
    tags?: YcCompanyUpdatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    organization?: OrganizationUpdateOneWithoutYcCompanyNestedInput
  }

  export type YcCompanyUncheckedUpdateWithoutYcPersonsInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    batch?: StringFieldUpdateOperationsInput | string
    status?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    longDescription?: NullableStringFieldUpdateOperationsInput | string | null
    teamSize?: NullableIntFieldUpdateOperationsInput | number | null
    allLocations?: NullableStringFieldUpdateOperationsInput | string | null
    industries?: YcCompanyUpdateindustriesInput | string[]
    subverticals?: YcCompanyUpdatesubverticalsInput | string[]
    tags?: YcCompanyUpdatetagsInput | string[]
    badges?: NullableJsonNullValueInput | InputJsonValue
    foundersRaw?: NullableJsonNullValueInput | InputJsonValue
    rawJson?: JsonNullValueInput | InputJsonValue
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PersonUpsertWithoutYcPersonInput = {
    update: XOR<PersonUpdateWithoutYcPersonInput, PersonUncheckedUpdateWithoutYcPersonInput>
    create: XOR<PersonCreateWithoutYcPersonInput, PersonUncheckedCreateWithoutYcPersonInput>
    where?: PersonWhereInput
  }

  export type PersonUpdateToOneWithWhereWithoutYcPersonInput = {
    where?: PersonWhereInput
    data: XOR<PersonUpdateWithoutYcPersonInput, PersonUncheckedUpdateWithoutYcPersonInput>
  }

  export type PersonUpdateWithoutYcPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUpdateManyWithoutPersonNestedInput
    sourceRecords?: SourceRecordUpdateManyWithoutPersonNestedInput
    matchDecisions?: MatchDecisionUpdateManyWithoutPersonNestedInput
  }

  export type PersonUncheckedUpdateWithoutYcPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUncheckedUpdateManyWithoutPersonNestedInput
    sourceRecords?: SourceRecordUncheckedUpdateManyWithoutPersonNestedInput
    matchDecisions?: MatchDecisionUncheckedUpdateManyWithoutPersonNestedInput
  }

  export type OrganizationCreateWithoutMatchDecisionsInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleCreateNestedManyWithoutOrganizationInput
    sourceRecords?: SourceRecordCreateNestedManyWithoutOrganizationInput
    ycCompany?: YcCompanyCreateNestedOneWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutMatchDecisionsInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    domain?: string | null
    website?: string | null
    linkedinUrl?: string | null
    description?: string | null
    logoUrl?: string | null
    industry?: string | null
    location?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    foundedYear?: number | null
    employeeCount?: number | null
    status?: string | null
    stageProxy?: string | null
    tags?: OrganizationCreatetagsInput | string[]
    isYcBacked?: boolean
    ycBatch?: string | null
    ycId?: string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleUncheckedCreateNestedManyWithoutOrganizationInput
    sourceRecords?: SourceRecordUncheckedCreateNestedManyWithoutOrganizationInput
    ycCompany?: YcCompanyUncheckedCreateNestedOneWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutMatchDecisionsInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutMatchDecisionsInput, OrganizationUncheckedCreateWithoutMatchDecisionsInput>
  }

  export type PersonCreateWithoutMatchDecisionsInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleCreateNestedManyWithoutPersonInput
    sourceRecords?: SourceRecordCreateNestedManyWithoutPersonInput
    ycPerson?: YcPersonCreateNestedOneWithoutPersonInput
  }

  export type PersonUncheckedCreateWithoutMatchDecisionsInput = {
    id?: string
    canonicalName: string
    dedupeKey: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    githubUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    location?: string | null
    city?: string | null
    country?: string | null
    expertise?: PersonCreateexpertiseInput | string[]
    ycId?: string | null
    sourceIds?: PersonCreatesourceIdsInput | string[]
    createdAt?: Date | string
    updatedAt?: Date | string
    roles?: RoleUncheckedCreateNestedManyWithoutPersonInput
    sourceRecords?: SourceRecordUncheckedCreateNestedManyWithoutPersonInput
    ycPerson?: YcPersonUncheckedCreateNestedOneWithoutPersonInput
  }

  export type PersonCreateOrConnectWithoutMatchDecisionsInput = {
    where: PersonWhereUniqueInput
    create: XOR<PersonCreateWithoutMatchDecisionsInput, PersonUncheckedCreateWithoutMatchDecisionsInput>
  }

  export type OrganizationUpsertWithoutMatchDecisionsInput = {
    update: XOR<OrganizationUpdateWithoutMatchDecisionsInput, OrganizationUncheckedUpdateWithoutMatchDecisionsInput>
    create: XOR<OrganizationCreateWithoutMatchDecisionsInput, OrganizationUncheckedCreateWithoutMatchDecisionsInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutMatchDecisionsInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutMatchDecisionsInput, OrganizationUncheckedUpdateWithoutMatchDecisionsInput>
  }

  export type OrganizationUpdateWithoutMatchDecisionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUpdateManyWithoutOrganizationNestedInput
    sourceRecords?: SourceRecordUpdateManyWithoutOrganizationNestedInput
    ycCompany?: YcCompanyUpdateOneWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutMatchDecisionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    domain?: NullableStringFieldUpdateOperationsInput | string | null
    website?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    industry?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    state?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    foundedYear?: NullableIntFieldUpdateOperationsInput | number | null
    employeeCount?: NullableIntFieldUpdateOperationsInput | number | null
    status?: NullableStringFieldUpdateOperationsInput | string | null
    stageProxy?: NullableStringFieldUpdateOperationsInput | string | null
    tags?: OrganizationUpdatetagsInput | string[]
    isYcBacked?: BoolFieldUpdateOperationsInput | boolean
    ycBatch?: NullableStringFieldUpdateOperationsInput | string | null
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    ycRawJson?: NullableJsonNullValueInput | InputJsonValue
    sourceIds?: OrganizationUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUncheckedUpdateManyWithoutOrganizationNestedInput
    sourceRecords?: SourceRecordUncheckedUpdateManyWithoutOrganizationNestedInput
    ycCompany?: YcCompanyUncheckedUpdateOneWithoutOrganizationNestedInput
  }

  export type PersonUpsertWithoutMatchDecisionsInput = {
    update: XOR<PersonUpdateWithoutMatchDecisionsInput, PersonUncheckedUpdateWithoutMatchDecisionsInput>
    create: XOR<PersonCreateWithoutMatchDecisionsInput, PersonUncheckedCreateWithoutMatchDecisionsInput>
    where?: PersonWhereInput
  }

  export type PersonUpdateToOneWithWhereWithoutMatchDecisionsInput = {
    where?: PersonWhereInput
    data: XOR<PersonUpdateWithoutMatchDecisionsInput, PersonUncheckedUpdateWithoutMatchDecisionsInput>
  }

  export type PersonUpdateWithoutMatchDecisionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUpdateManyWithoutPersonNestedInput
    sourceRecords?: SourceRecordUpdateManyWithoutPersonNestedInput
    ycPerson?: YcPersonUpdateOneWithoutPersonNestedInput
  }

  export type PersonUncheckedUpdateWithoutMatchDecisionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    canonicalName?: StringFieldUpdateOperationsInput | string
    dedupeKey?: StringFieldUpdateOperationsInput | string
    firstName?: NullableStringFieldUpdateOperationsInput | string | null
    lastName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    githubUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    city?: NullableStringFieldUpdateOperationsInput | string | null
    country?: NullableStringFieldUpdateOperationsInput | string | null
    expertise?: PersonUpdateexpertiseInput | string[]
    ycId?: NullableStringFieldUpdateOperationsInput | string | null
    sourceIds?: PersonUpdatesourceIdsInput | string[]
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RoleUncheckedUpdateManyWithoutPersonNestedInput
    sourceRecords?: SourceRecordUncheckedUpdateManyWithoutPersonNestedInput
    ycPerson?: YcPersonUncheckedUpdateOneWithoutPersonNestedInput
  }

  export type RoleCreateManyOrganizationInput = {
    id?: string
    personId: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SourceRecordCreateManyOrganizationInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    personId?: string | null
  }

  export type MatchDecisionCreateManyOrganizationInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    personId?: string | null
    createdAt?: Date | string
  }

  export type RoleUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    person?: PersonUpdateOneRequiredWithoutRolesNestedInput
  }

  export type RoleUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    personId?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    personId?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SourceRecordUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    person?: PersonUpdateOneWithoutSourceRecordsNestedInput
  }

  export type SourceRecordUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SourceRecordUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type MatchDecisionUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    person?: PersonUpdateOneWithoutMatchDecisionsNestedInput
  }

  export type MatchDecisionUncheckedUpdateWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    personId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchDecisionUncheckedUpdateManyWithoutOrganizationInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    personId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleCreateManyPersonInput = {
    id?: string
    organizationId: string
    title?: string | null
    roleType?: string | null
    functionType?: string | null
    isCurrent?: boolean
    startDate?: Date | string | null
    endDate?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SourceRecordCreateManyPersonInput = {
    id?: string
    sourceAdapter: string
    sourceUrl: string
    sourceId?: string | null
    rawPayload: JsonNullValueInput | InputJsonValue
    entityType: string
    fetchedAt?: Date | string
    normalizedAt?: Date | string | null
    organizationId?: string | null
  }

  export type MatchDecisionCreateManyPersonInput = {
    id?: string
    entityType: string
    candidateIds?: MatchDecisionCreatecandidateIdsInput | string[]
    selectedId?: string | null
    matchRuleUsed: string
    confidenceScore: number
    decisionType: string
    resolverVersion: string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    organizationId?: string | null
    createdAt?: Date | string
  }

  export type RoleUpdateWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    organization?: OrganizationUpdateOneRequiredWithoutRolesNestedInput
  }

  export type RoleUncheckedUpdateWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleUncheckedUpdateManyWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    organizationId?: StringFieldUpdateOperationsInput | string
    title?: NullableStringFieldUpdateOperationsInput | string | null
    roleType?: NullableStringFieldUpdateOperationsInput | string | null
    functionType?: NullableStringFieldUpdateOperationsInput | string | null
    isCurrent?: BoolFieldUpdateOperationsInput | boolean
    startDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SourceRecordUpdateWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    organization?: OrganizationUpdateOneWithoutSourceRecordsNestedInput
  }

  export type SourceRecordUncheckedUpdateWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SourceRecordUncheckedUpdateManyWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    sourceAdapter?: StringFieldUpdateOperationsInput | string
    sourceUrl?: StringFieldUpdateOperationsInput | string
    sourceId?: NullableStringFieldUpdateOperationsInput | string | null
    rawPayload?: JsonNullValueInput | InputJsonValue
    entityType?: StringFieldUpdateOperationsInput | string
    fetchedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    normalizedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type MatchDecisionUpdateWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    organization?: OrganizationUpdateOneWithoutMatchDecisionsNestedInput
  }

  export type MatchDecisionUncheckedUpdateWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchDecisionUncheckedUpdateManyWithoutPersonInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityType?: StringFieldUpdateOperationsInput | string
    candidateIds?: MatchDecisionUpdatecandidateIdsInput | string[]
    selectedId?: NullableStringFieldUpdateOperationsInput | string | null
    matchRuleUsed?: StringFieldUpdateOperationsInput | string
    confidenceScore?: FloatFieldUpdateOperationsInput | number
    decisionType?: StringFieldUpdateOperationsInput | string
    resolverVersion?: StringFieldUpdateOperationsInput | string
    metadata?: NullableJsonNullValueInput | InputJsonValue
    organizationId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type YcPersonCreateManyYcCompanyInput = {
    id?: string
    ycId: string
    name: string
    role?: string | null
    linkedinUrl?: string | null
    twitterUrl?: string | null
    avatarUrl?: string | null
    bio?: string | null
    personId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type YcPersonUpdateWithoutYcCompanyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    person?: PersonUpdateOneWithoutYcPersonNestedInput
  }

  export type YcPersonUncheckedUpdateWithoutYcCompanyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type YcPersonUncheckedUpdateManyWithoutYcCompanyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ycId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    linkedinUrl?: NullableStringFieldUpdateOperationsInput | string | null
    twitterUrl?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    bio?: NullableStringFieldUpdateOperationsInput | string | null
    personId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use OrganizationCountOutputTypeDefaultArgs instead
     */
    export type OrganizationCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = OrganizationCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use PersonCountOutputTypeDefaultArgs instead
     */
    export type PersonCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = PersonCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use YcCompanyCountOutputTypeDefaultArgs instead
     */
    export type YcCompanyCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = YcCompanyCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use OrganizationDefaultArgs instead
     */
    export type OrganizationArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = OrganizationDefaultArgs<ExtArgs>
    /**
     * @deprecated Use PersonDefaultArgs instead
     */
    export type PersonArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = PersonDefaultArgs<ExtArgs>
    /**
     * @deprecated Use RoleDefaultArgs instead
     */
    export type RoleArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = RoleDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SourceRecordDefaultArgs instead
     */
    export type SourceRecordArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SourceRecordDefaultArgs<ExtArgs>
    /**
     * @deprecated Use IngestionJobDefaultArgs instead
     */
    export type IngestionJobArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = IngestionJobDefaultArgs<ExtArgs>
    /**
     * @deprecated Use YcCompanyDefaultArgs instead
     */
    export type YcCompanyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = YcCompanyDefaultArgs<ExtArgs>
    /**
     * @deprecated Use YcPersonDefaultArgs instead
     */
    export type YcPersonArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = YcPersonDefaultArgs<ExtArgs>
    /**
     * @deprecated Use MatchDecisionDefaultArgs instead
     */
    export type MatchDecisionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = MatchDecisionDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}