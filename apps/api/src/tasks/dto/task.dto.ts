import { Priority, TaskStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateTaskDto {
  @Transform(trim)
  @IsString()
  @Length(1, 140)
  title!: string;

  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** User id of a household member, or null to unassign. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  assigneeId?: string | null;

  /** YYYY-MM-DD, or null. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  dueAt?: string | null;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}

export class UpdateTaskDto extends CreateTaskDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 140)
  declare title: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class CreateTaskCommentDto {
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  content!: string;
}

export class ListTasksQuery {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  /** "true" to include DONE tasks (default: open tasks only). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  includeDone?: boolean;
}
