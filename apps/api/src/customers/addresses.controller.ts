import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    sessionId: string;
  };
}

// transform:true so @Transform(trim) runs before @Matches/@IsNotEmpty; whitelist
// strips any non-DTO property (notably an injected customerId).
const addressPipe = new ValidationPipe({ whitelist: true, transform: true });

@Controller('customers/me/addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @HttpCode(200)
  list(@Request() req: AuthenticatedRequest) {
    return this.addressesService.list(req.user.id);
  }

  @Post()
  @HttpCode(201)
  @UsePipes(addressPipe)
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.create(req.user.id, dto);
  }

  @Patch(':addressId')
  @HttpCode(200)
  @UsePipes(addressPipe)
  update(
    @Request() req: AuthenticatedRequest,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(req.user.id, addressId, dto);
  }

  @Delete(':addressId')
  @HttpCode(200)
  remove(
    @Request() req: AuthenticatedRequest,
    @Param('addressId') addressId: string,
  ) {
    return this.addressesService.remove(req.user.id, addressId);
  }

  @Post(':addressId/default-shipping')
  @HttpCode(200)
  setDefaultShipping(
    @Request() req: AuthenticatedRequest,
    @Param('addressId') addressId: string,
  ) {
    return this.addressesService.setDefaultShipping(req.user.id, addressId);
  }

  @Post(':addressId/default-billing')
  @HttpCode(200)
  setDefaultBilling(
    @Request() req: AuthenticatedRequest,
    @Param('addressId') addressId: string,
  ) {
    return this.addressesService.setDefaultBilling(req.user.id, addressId);
  }
}
