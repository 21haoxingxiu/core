import { keyBy, pick } from 'lodash'
import snakecaseKeys from 'snakecase-keys'

import { Body, Delete, Get, Param, Post, Query } from '@nestjs/common'

import { ApiController } from '~/common/decorators/api-controller.decorator'
import { Auth } from '~/common/decorators/auth.decorator'
import { HTTPDecorators } from '~/common/decorators/http.decorator'
import { IpLocation, IpRecord } from '~/common/decorators/ip.decorator'
import { PagerDto } from '~/shared/dto/pager.dto'

import { Activity } from './activity.constant'
import { ActivityService } from './activity.service'
import {
  ActivityDeleteDto,
  ActivityQueryDto,
  ActivityTypeParamsDto,
  ReadingRangeDto,
} from './dtos/activity.dto'
import { LikeBodyDto } from './dtos/like.dto'
import { GetPresenceQueryDto, UpdatePresenceDto } from './dtos/presence.dto'

@ApiController('/activity')
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Post('/like')
  async thumbsUpArticle(
    @Body() body: LikeBodyDto,
    @IpLocation() location: IpRecord,
  ) {
    const { ip } = location
    const { id, type } = body

    await this.service.likeAndEmit(type.toLowerCase() as any, id, ip)

    return
  }

  @Get('/likes')
  @Auth()
  async getLikeActivities(@Query() pager: PagerDto) {
    const { page, size } = pager

    return this.service.getLikeActivities(page, size)
  }

  @Get('/')
  @Auth()
  async activities(@Query() pager: ActivityQueryDto) {
    const { page, size, type } = pager

    switch (type) {
      case Activity.Like:
        return this.service.getLikeActivities(page, size)

      case Activity.ReadDuration:
        return this.service.getReadDurationActivities(page, size)
    }
  }

  @Post('/presence/update')
  async updatePresence(
    @Body() body: UpdatePresenceDto,
    @IpLocation() location: IpRecord,
  ) {
    await this.service.updatePresence(body, location.ip)
  }

  @Get('/presence')
  @HTTPDecorators.SkipLogging
  @HTTPDecorators.Bypass
  async getPresence(@Query() query: GetPresenceQueryDto) {
    return this.service
      .getRoomPresence(query.room_name)
      .then((list) => {
        return list.map(({ ip, ...item }) => {
          return snakecaseKeys(item)
        })
      })
      .then((list) => {
        return keyBy(list, 'identity')
      })
  }

  @Delete('/:type')
  @Auth()
  async deletePresence(
    @Param() params: ActivityTypeParamsDto,
    @Body() Body: ActivityDeleteDto,
  ) {
    return this.service.deleteActivityByType(
      params.type,
      Body.before ? new Date(Body.before) : new Date(),
    )
  }

  @Auth()
  @Delete('/all')
  async deleteAllPresence() {
    return this.service.deleteAll()
  }

  @Get('/rooms')
  async getRoomsInfo() {
    const roomInfo = await this.service.getAllRoomNames()
    const { objects } = await this.service.getRefsFromRoomNames(roomInfo.rooms)

    for (const type in objects) {
      objects[type] = objects[type].map(pickUsageField)
    }

    function pickUsageField(item) {
      // skip if model is recently
      if (!item.title) return item

      return pick(item, [
        'title',
        'slug',
        'cover',
        'created',
        'category',
        'categoryId',
        'id',
        'nid',
      ])
    }

    return {
      ...roomInfo,
      objects,
    }
  }

  @Auth()
  @Get('/reading/rank')
  async getReadingRangeRank(@Query() query: ReadingRangeDto) {
    const startAt = query.start ? new Date(query.start) : undefined
    const endAt = query.end ? new Date(query.end) : undefined

    return this.service
      .getDateRangeOfReadings(startAt, endAt)
      .then((arr) => {
        return arr.sort((a, b) => {
          return b.count - a.count
        })
      })
      .then((arr) => {
        // omit ref fields

        return arr.map((item) => {
          return {
            ...item,
            ref: pick(item.ref, [
              'title',
              'slug',
              'cover',
              'created',
              'category',
              'categoryId',
              'id',
              'nid',
            ]),
          }
        })
      })
  }
}
