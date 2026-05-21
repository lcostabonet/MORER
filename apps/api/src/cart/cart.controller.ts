import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CartService } from './cart.service';
import type { AddItemDto } from './dto/add-item.dto';
import type { CreateCartDto } from './dto/create-cart.dto';
import type { UpdateItemDto } from './dto/update-item.dto';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post()
  create(@Body() body: CreateCartDto) {
    return this.cartService.create(body);
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
