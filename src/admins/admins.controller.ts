import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminsService } from './admins.service';
import { CreateAdminDto, CreateAdminSchema } from './dto/create-admin.dto';
import { ResetPasswordDto, ResetPasswordSchema } from './dto/reset-password.dto';
import { UpdateAdminDto, UpdateAdminSchema } from './dto/update-admin.dto';
import { UpdateMfaDto, UpdateMfaSchema } from './dto/update-mfa.dto';

@Controller('admins')
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  findAll() {
    return this.adminsService.findAll();
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateAdminSchema)) dto: CreateAdminDto) {
    return this.adminsService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminsService.findOne(id);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateAdminSchema)) dto: UpdateAdminDto) {
    return this.adminsService.patch(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminsService.remove(id);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    return this.adminsService.resetPassword(id, dto);
  }

  @Patch(':id/mfa')
  updateMfa(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateMfaSchema)) dto: UpdateMfaDto) {
    return this.adminsService.updateMfa(id, dto);
  }
}
