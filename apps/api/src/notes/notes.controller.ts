import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common';
import type { AuthenticatedUser } from '../common';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { NoteSummary, NoteView } from './note.types';
import { NotesService } from './notes.service';

@Controller('households/:householdId/notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
  ): Promise<NoteSummary[]> {
    return this.notes.list(user.id, householdId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: CreateNoteDto,
  ): Promise<NoteView> {
    return this.notes.create(user.id, householdId, dto);
  }

  @Get(':noteId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ): Promise<NoteView> {
    return this.notes.get(user.id, householdId, noteId);
  }

  @Patch(':noteId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateNoteDto,
  ): Promise<NoteView> {
    return this.notes.update(user.id, householdId, noteId, dto);
  }

  @Delete(':noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ): Promise<void> {
    return this.notes.remove(user.id, householdId, noteId);
  }
}
