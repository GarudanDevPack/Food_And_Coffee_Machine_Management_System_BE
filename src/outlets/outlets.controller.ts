import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { OutletsService } from './outlets.service';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { JwtAuth } from '../auth/guards/jwt-auth.guard';
import { RoleEnum } from '../roles/roles.enum';

@ApiTags('Outlets')
@Controller({ path: 'outlets', version: '1' })
export class OutletsController {
  constructor(private readonly outletsService: OutletsService) {}

  // ─── Public: QR Scan ─────────────────────────────────────────────────────────

  /**
   * Public endpoint — no authentication required.
   * Called when customer scans the outlet QR code.
   * Returns outlet info + available items with prices.
   */
  @Get('scan/:qrToken')
  @ApiParam({
    name: 'qrToken',
    description: 'Unique token encoded in the outlet QR code',
  })
  @HttpCode(HttpStatus.OK)
  scanQr(@Param('qrToken') qrToken: string) {
    return this.outletsService.scanQr(qrToken);
  }

  // ─── Agent: Outlet Management ─────────────────────────────────────────────

  /**
   * Create a new outlet.
   * Agent automatically becomes the owner.
   */
  @JwtAuth(RoleEnum.agent, RoleEnum.admin, RoleEnum.super_admin)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req, @Body() dto: CreateOutletDto) {
    return this.outletsService.create(req.user.id, dto);
  }

  /**
   * List outlets.
   *   - SuperAdmin / Admin / Client → all outlets
   *   - Agent → only their own outlets
   */
  @JwtAuth(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.client,
    RoleEnum.agent,
  )
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Request() req) {
    return this.outletsService.findAll(req.user.role.id, req.user.id);
  }

  @JwtAuth(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.client,
    RoleEnum.agent,
  )
  @Get(':id')
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.outletsService.findOne(id);
  }

  @JwtAuth(RoleEnum.agent, RoleEnum.admin, RoleEnum.super_admin)
  @Patch(':id')
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateOutletDto,
  ) {
    return this.outletsService.update(id, req.user.id, req.user.role.id, dto);
  }

  @JwtAuth(RoleEnum.agent, RoleEnum.admin, RoleEnum.super_admin)
  @Delete(':id')
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Request() req) {
    return this.outletsService.remove(id, req.user.id, req.user.role.id);
  }

  // ─── QR Code Image ───────────────────────────────────────────────────────────

  /**
   * Returns the outlet QR code as a PNG image.
   * Agent uses this to print / display the QR for customers to scan.
   */
  @JwtAuth(RoleEnum.agent, RoleEnum.admin, RoleEnum.super_admin)
  @Get(':id/qr')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'PNG QR code image',
    content: { 'image/png': {} },
  })
  async getQrCode(
    @Param('id') id: string,
    @Request() req,
    @Res() res: Response,
  ) {
    const buffer = await this.outletsService.generateQrCode(
      id,
      req.user.id,
      req.user.role.id,
    );
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(buffer);
  }
}
