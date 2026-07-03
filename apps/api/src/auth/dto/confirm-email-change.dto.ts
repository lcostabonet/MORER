import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmEmailChangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}
