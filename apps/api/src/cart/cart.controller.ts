import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CartService } from './cart.service';
import type { AddItemDto } from './dto/add-item.dto';
import { CreateCartDto } from './dto/create-cart.dto';
import type { UpdateItemDto } from './dto/update-item.dto';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  // Route-scoped validation (11G-beta): POST /cart accepts NO fields. Any property
  // (including a caller-supplied sessionId — even a valid UUID) is rejected with
  // 400 (forbidNonWhitelisted). The API generates the session id itself.
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  create(@Body() _body: CreateCartDto) {
    return this.cartService.create();
  }

  // Declared before GET :id to avoid route conflict (static segment 'session' first).
  @Get('session/:sessionId')
  findBySessionId(@Param('sessionId') sessionId: string) {
    return this.cartService.findBySessionId(sessionId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.cartService.findById(id);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() body: AddItemDto) {
    return this.cartService.addItem(id, body);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateItemDto,
  ) {
    return this.cartService.updateItem(id, itemId, body);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(id, itemId);
  }
}
