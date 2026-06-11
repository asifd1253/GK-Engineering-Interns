import { Controller, Get, Post, Body, Delete, Param, Patch, Put } from '@nestjs/common';
import { UsersService } from './users.service';
import { PermissionDefsService } from './permission-defs.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionDefsService: PermissionDefsService,
  ) {}

  @Get('permission-defs')
  getPermissionDefs() {
    return this.permissionDefsService.getSystemModules();
  }

  // ─── User Endpoints ─────────────────────────────────────────────────────────

  @Post()
  create(@Body() createUserDto: any) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // ─── Role Endpoints (must be before :id routes) ─────────────────────────────

  @Get('roles')
  findAllRoles() {
    return this.usersService.findAllRoles();
  }

  @Post('roles')
  createRole(@Body() roleDto: any) {
    return this.usersService.createRole(roleDto);
  }

  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() updateDto: any) {
    return this.usersService.updateRole(id, updateDto);
  }

  @Delete('roles/:id')
  removeRole(@Param('id') id: string) {
    return this.usersService.deleteRole(id);
  }

  // ─── Dynamic :id routes (must be after static routes) ───────────────────────

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.delete(id);
  }

  @Post(':id')
  update(@Param('id') id: string, @Body() updateDto: any) {
    return this.usersService.update(id, updateDto);
  }
}
