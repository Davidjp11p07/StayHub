import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';

import { INVENTORY_ITEM_TYPES, NAME_MAX_LENGTH, QUANTITY_MAX, type InventoryItemType } from '@inventory/domain/inventory-item';

/** Path parameter of every inventory route. */
export class RoomParamsDto {
  @IsUUID('all')
  public roomId!: string;
}

export class AddInventoryItemDto {
  @IsIn(INVENTORY_ITEM_TYPES)
  public type!: InventoryItemType;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value)
  @IsString()
  @Length(1, NAME_MAX_LENGTH)
  public name!: string;

  @IsInt()
  @Min(0)
  @Max(QUANTITY_MAX)
  public quantityAvailable!: number;

  @IsBoolean()
  public active!: boolean;
}

export class ReplaceInventoryItemDto extends AddInventoryItemDto {
  @IsUUID('all')
  public id!: string;
}

export class ReplaceRoomInventoryDto {
  @IsInt()
  @Min(0)
  public expectedVersion!: number;

  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique((item: ReplaceInventoryItemDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => ReplaceInventoryItemDto)
  public items!: ReplaceInventoryItemDto[];
}
