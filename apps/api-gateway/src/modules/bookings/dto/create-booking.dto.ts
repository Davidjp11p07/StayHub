import { IsBoolean, ValidateIf, IsDateString, IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @ValidateIf((_, value: unknown) => value !== undefined) @IsBoolean() public breakfastSelected?: boolean;
  @ValidateIf((_, value: unknown) => value !== undefined) @IsInt() @Min(1) public expectedPropertyVersion?: number;
  @IsUUID() public propertyId!: string;
  @IsUUID() public roomId!: string;
  @IsDateString({ strict: true }) public checkIn!: string;
  @IsDateString({ strict: true }) public checkOut!: string;
  @IsInt() @Min(1) @Max(100) public guests!: number;
}
