import { Module } from '@nestjs/common'
import { ToolController } from './tool.contoller'
import { ToolService } from './tool.service'

@Module({
  providers: [ToolService],
  controllers: [ToolController],
  exports: [ToolService],
})
export class ToolModule {}
