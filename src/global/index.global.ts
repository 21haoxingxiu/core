import { Logger } from '@nestjs/common'
import cluster from 'cluster'
import { mkdirSync } from 'fs'
import 'zx/globals'
import { CLUSTER } from '~/app.config'
import {
  DATA_DIR,
  LOG_DIR,
  TEMP_DIR,
  USER_ASSET_DIR,
} from '~/constants/path.constant'
import { consola } from './consola.global'
import './dayjs.global'
import { isDev } from './env.global'

// 建立目录
function mkdirs() {
  if (!CLUSTER.enable || cluster.isPrimary) {
    mkdirSync(DATA_DIR, { recursive: true })
    Logger.log(chalk.blue('数据目录已经建好: ' + DATA_DIR))
    mkdirSync(TEMP_DIR, { recursive: true })
    Logger.log(chalk.blue('临时目录已经建好: ' + TEMP_DIR))
    mkdirSync(LOG_DIR, { recursive: true })
    Logger.log(chalk.blue('日志目录已经建好: ' + LOG_DIR))
    mkdirSync(USER_ASSET_DIR, { recursive: true })
    Logger.log(chalk.blue('资源目录已经建好: ' + USER_ASSET_DIR))
  }
}

function registerGlobal() {
  $.verbose = isDev

  console.debug = (...rest) => {
    if (isDev) {
      consola.log.call(console, ...rest)
    }
  }

  Object.assign(globalThis, {
    isDev: isDev,
    consola,
  })
}

export function register() {
  mkdirs()
  registerGlobal()
}
