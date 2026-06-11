import { Controller, Get, Post, Patch, Param, Body, Query, Headers, Delete } from '@nestjs/common';
import { ProductionService } from './production.service';
import { ProcessType } from './schemas/process-stage.schema';

@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('stages')
  async findAll(@Query('type') type: ProcessType) {
    return this.productionService.findAll(type);
  }

  @Get('machine-analytics')
  async getMachineAnalytics(@Query('from') from?: string, @Query('to') to?: string) {
    return this.productionService.getMachineAnalytics(from, to);
  }

  @Get('machines')
  async getMachines(
    @Query('type') type: string,
  ) {
    return this.productionService.getMachines(type);
  }


  @Post('machines')
  async createMachine(@Body() data: any) {
    return this.productionService.createMachine(data);
  }

  @Patch('machines/:id')
  async updateMachine(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateMachine(id, data);
  }

  @Delete('machines/:id')
  async deleteMachine(@Param('id') id: string) {
    return this.productionService.deleteMachine(id);
  }

  // Shifts
  @Get('shifts')
  async getShifts() {
    return this.productionService.getShifts();
  }

  @Post('shifts')
  async createShift(@Body() data: any) {
    return this.productionService.createShift(data);
  }

  @Patch('shifts/:id')
  async updateShift(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateShift(id, data);
  }

  @Delete('shifts/:id')
  async deleteShift(@Param('id') id: string) {
    return this.productionService.deleteShift(id);
  }

  // Departments
  @Get('departments')
  async getDepartments() {
    return this.productionService.getDepartments();
  }
  @Post('departments')
  async createDepartment(@Body() data: any) {
    return this.productionService.createDepartment(data);
  }
  @Patch('departments/:id')
  async updateDepartment(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateDepartment(id, data);
  }
  @Delete('departments/:id')
  async deleteDepartment(@Param('id') id: string) {
    return this.productionService.deleteDepartment(id);
  }

  // MachineTypes
  @Get('machine-types')
  async getMachineTypes() {
    return this.productionService.getMachineTypes();
  }
  @Post('machine-types')
  async createMachineType(@Body() data: any) {
    return this.productionService.createMachineType(data);
  }
  @Patch('machine-types/:id')
  async updateMachineType(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateMachineType(id, data);
  }
  @Delete('machine-types/:id')
  async deleteMachineType(@Param('id') id: string) {
    return this.productionService.deleteMachineType(id);
  }

  // Reason Master
  @Get('reasons')
  async getReasons() {
    return this.productionService.getReasons();
  }
  @Post('reasons')
  async createReason(@Body() data: any) {
    return this.productionService.createReason(data);
  }
  @Patch('reasons/:id')
  async updateReason(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateReason(id, data);
  }
  @Delete('reasons/:id')
  async deleteReason(@Param('id') id: string) {
    return this.productionService.deleteReason(id);
  }

  // Processes
  @Get('processes')
  async getProcesses() {
    return this.productionService.getProcesses();
  }
  @Post('processes')
  async createProcess(@Body() data: any) {
    return this.productionService.createProcess(data);
  }
  @Patch('processes/:id')
  async updateProcess(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateProcess(id, data);
  }
  @Delete('processes/:id')
  async deleteProcess(@Param('id') id: string) {
    return this.productionService.deleteProcess(id);
  }

  // Program Master
  @Get('program-masters')
  async getProgramMasters() {
    return this.productionService.getProgramMasters();
  }
  @Post('program-masters')
  async createProgramMaster(@Body() data: any) {
    return this.productionService.createProgramMaster(data);
  }
  @Patch('program-masters/:id')
  async updateProgramMaster(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateProgramMaster(id, data);
  }
  @Delete('program-masters/:id')
  async deleteProgramMaster(@Param('id') id: string) {
    return this.productionService.deleteProgramMaster(id);
  }

  // Vendors
  @Get('vendors')
  async getVendors() {
    return this.productionService.getVendors();
  }
  @Post('vendors')
  async createVendor(@Body() data: any) {
    return this.productionService.createVendor(data);
  }
  @Patch('vendors/:id')
  async updateVendor(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateVendor(id, data);
  }
  @Delete('vendors/:id')
  async deleteVendor(@Param('id') id: string) {
    return this.productionService.deleteVendor(id);
  }

  // Material Master
  @Get('materials')
  async getMaterials() {
    return this.productionService.getMaterials();
  }
  @Post('materials')
  async createMaterial(@Body() data: any) {
    return this.productionService.createMaterial(data);
  }
  @Patch('materials/:id')
  async updateMaterial(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateMaterial(id, data);
  }
  @Delete('materials/:id')
  async deleteMaterial(@Param('id') id: string) {
    return this.productionService.deleteMaterial(id);
  }

  // Part Master
  @Get('parts')
  async getParts() {
    return this.productionService.getParts();
  }
  @Post('parts')
  async createPart(@Body() data: any) {
    return this.productionService.createPart(data);
  }
  @Patch('parts/:id')
  async updatePart(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updatePart(id, data);
  }
  @Delete('parts/:id')
  async deletePart(@Param('id') id: string) {
    return this.productionService.deletePart(id);
  }

  // Operators
  @Get('operators')
  async getOperators(@Query('process') process?: string) {
    return this.productionService.getOperators(process);
  }

  @Get('operators/all')
  async getAllOperators() {
    return this.productionService.getAllOperators();
  }

  @Post('operators')
  async createOperator(@Body() data: any) {
    return this.productionService.createOperator(data);
  }

  @Patch('operators/:id')
  async updateOperator(@Param('id') id: string, @Body() data: any) {
    return this.productionService.updateOperator(id, data);
  }

  @Delete('operators/:id')
  async deleteOperator(@Param('id') id: string) {
    return this.productionService.deleteOperator(id);
  }

  @Post('stages/:id/start')
  async startStage(
    @Param('id') id: string,
    @Body() body: {
      userId: string;
      plannedTiming?: string;
      machineId?: string;
      machineAssignments?: Array<{
        machineId: string;
        qty?: number;
        targetQuantity?: number;
        startDate?: string;
        endDate?: string;
        programId?: string;
        cycleTime?: number;
        totalCycleTimeSeconds?: number;
        partsPerCycle?: number;
        partsType?: string | number;
        selectPartType?: string | number;
        pricePerPart?: number;
        startTime?: number;
        StartTime?: number;
        endTime?: number;
        EndTime?: number;
        status?: string;
        Status?: string;
        shiftId?: string;
        CustId?: string;
        PlantId?: string;
        custId?: string;
        plantId?: string;
      }>;
      extraDetails?: any;
    }
  ) {
    return this.productionService.startStage(
      id,
      body.userId,
      body.plannedTiming,
      body.machineId,
      body.machineAssignments,
      body.extraDetails
    );
  }

  @Post('stages/:id/signal-qi')
  async signalQI(@Param('id') id: string, @Body() body: { userId: string, note?: string }) {
    return this.productionService.signalQI(id, body.userId, body.note);
  }

  @Post('stages/:id/machine-assignments/early-end')
  async earlyEndMachineAssignment(
    @Param('id') id: string,
    @Body() body: {
      userId: string;
      machineId: string;
      productionDate: string;
      shift: string;
      shiftId?: string;
      reason: string;
      endTime?: number;
    }
  ) {
    return this.productionService.earlyEndMachineAssignment(
      id,
      body.userId,
      body.machineId,
      body.productionDate,
      body.shift,
      body.reason,
      body.endTime,
      body.shiftId,
    );
  }

  @Post('stages/:id/submit-qi')
  async submitQI(@Param('id') id: string, @Body() body: { data: any, userId: string }) {
    return this.productionService.submitQI(id, body.data, body.userId);
  }

  @Post('stages/:id/approve-qi')
  async approveQI(@Param('id') id: string, @Body() body: { userId: string }) {
    return this.productionService.approveQI(id, body.userId);
  }

  @Post('stages/:id/route')
  async routeStage(@Param('id') id: string, @Body() body: { nextType: string | null, isRework: boolean }) {
    return this.productionService.managerRouteStage(id, body.nextType, body.isRework);
  }

  @Get('quality-reasons')
  async getQualityReasons(@Query('type') type?: string, @Query('category') category?: string) {
    return this.productionService.getQualityReasons(type, category);
  }

  @Post('quality-reasons')
  async createQualityReason(@Body() data: any) {
    return this.productionService.createQualityReason(data);
  }

  // Debug or manual creation if needed
  @Post('stages')
  async createStage(@Body() data: any) {
    return this.productionService.createStage(data);
  }
}
