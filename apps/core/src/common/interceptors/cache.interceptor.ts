/**
 * HttpCache interceptor.
 * @file 缓存拦截器
 * @module interceptor/cache
 * @author Surmon <https://github.com/surmon-china>
 * @author Innei <https://innei.ren>
 */
import { of, tap } from 'rxjs'
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { Observable } from 'rxjs'

import { Inject, Injectable, Logger, RequestMethod } from '@nestjs/common'
import { HttpAdapterHost, Reflector } from '@nestjs/core'

import { HTTP_CACHE, REDIS } from '~/app.config'
import { API_CACHE_PREFIX } from '~/constants/cache.constant'
import * as META from '~/constants/meta.constant'
import * as SYSTEM from '~/constants/system.constant'
import { CacheService } from '~/processors/redis/cache.service'
import { getNestExecutionContextRequest } from '~/transformers/get-req.transformer'

/**
 * @class HttpCacheInterceptor
 * @classdesc 弥补框架不支持单独定义 ttl 参数以及单请求应用的缺陷
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  private readonly logger: Logger
  constructor(
    private readonly cacheManager: CacheService,
    @Inject(SYSTEM.REFLECTOR) private readonly reflector: Reflector,

    private readonly httpAdapterHost: HttpAdapterHost,
  ) {
    this.logger = new Logger(HttpCacheInterceptor.name)
  }

  // 自定义装饰器，修饰 ttl 参数
  async intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Promise<Observable<any>> {
    // 如果想彻底禁用缓存服务，则直接返回 -> return call$;
    const call$ = next.handle()

    if (REDIS.disableApiCache) {
      return call$
    }

    const request = this.getRequest(context)

    // 如果请求通过认证，跳过缓存因为，认证后的请求可能会有敏感数据
    if (request.isAuthenticated) {
      return call$
    }

    // 只有 GET 请求才会缓存
    if (request.method.toLowerCase() !== 'get') {
      return call$
    }

    const query: any = request.query || ({} as Record<string, any>)
    const queryWithTs = query.ts || query.timestamp || query._t || query.t

    // 如果请求中带有时间戳参数，则不缓存
    if (queryWithTs) {
      return call$
    }

    const handler = context.getHandler()

    const isDisableCache = this.reflector.get(META.HTTP_CACHE_DISABLE, handler)

    if (isDisableCache) {
      return call$
    }
    let key = this.trackBy(context) || `${API_CACHE_PREFIX}${request.url}`
    if (request.user?.id) key = `${key}:logged-${request.user?.id}`

    const metaTTL = this.reflector.get(META.HTTP_CACHE_TTL_METADATA, handler)
    const ttl = metaTTL || HTTP_CACHE.ttl

    const res = context.switchToHttp().getResponse<FastifyReply>()

    try {
      const value = await this.cacheManager.get(key)

      if (value) {
        this.logger.debug(`hit cache:${key}`)
        this.setCacheHeader(res, ttl)
      }

      return value
        ? of(value)
        : call$.pipe(
            tap((response) => {
              response && this.cacheManager.set(key, response, ttl * 1000)

              this.setCacheHeader(res, ttl)
            }),
          )
    } catch (error) {
      console.error(error)

      return call$
    }
  }

  setCacheHeader(res: FastifyReply, ttl: number) {
    if (res.raw.statusCode !== 200) return
    if (HTTP_CACHE.enableCDNHeader) {
      res.header(
        'cdn-cache-control',
        `max-age=${ttl}, stale-while-revalidate=60`,
      )

      res.header(
        'Cloudflare-CDN-Cache-Control',
        `max-age=${ttl}, stale-while-revalidate=60`,
      )
    }
    // 如果有则不覆盖
    if (res.getHeader('cache-control')) {
      return
    }

    let cacheHeaderValue = ''

    if (HTTP_CACHE.enableForceCacheHeader) {
      cacheHeaderValue += `max-age=${ttl}`
    }

    if (HTTP_CACHE.enableCDNHeader) {
      if (cacheHeaderValue) cacheHeaderValue += ', '
      cacheHeaderValue += `s-maxage=${ttl}, stale-while-revalidate=60`
    }

    if (cacheHeaderValue) res.header('cache-control', cacheHeaderValue)
  }

  trackBy(context: ExecutionContext): string | undefined {
    const request = this.getRequest(context)
    const httpServer = this.httpAdapterHost.httpAdapter
    const isHttpApp = request
    const isGetRequest =
      isHttpApp &&
      httpServer.getRequestMethod(request) === RequestMethod[RequestMethod.GET]
    const cacheKey = this.reflector.get(
      META.HTTP_CACHE_KEY_METADATA,
      context.getHandler(),
    )
    const isMatchedCache = isHttpApp && isGetRequest && cacheKey
    return isMatchedCache ? cacheKey : undefined
  }

  get getRequest() {
    return getNestExecutionContextRequest.bind(
      this,
    ) as typeof getNestExecutionContextRequest
  }
}
