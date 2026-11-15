import { IsUUID } from 'class-validator';

/** Path parameter of every inventory route. Body DTOs for POST (T048) and PUT (T059) join this file in Iteration 2. */
export class RoomParamsDto {
  @IsUUID('all')
  public roomId!: string;
}
