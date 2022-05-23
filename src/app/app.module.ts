import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VideoRoomsGateway } from './videoRooms.gateway';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, VideoRoomsGateway],
})
export class AppModule {}
