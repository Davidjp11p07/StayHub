import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ReviewsProxyModule } from '../reviews/reviews-proxy.module';
import { ChatCatalogService } from './chat-catalog.service';

@Module({ imports: [ReviewsProxyModule], controllers: [ChatController], providers: [ChatCatalogService] })
export class ChatModule {}
