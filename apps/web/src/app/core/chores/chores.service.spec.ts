import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { fromIsoDate, toIsoDate } from '../../features/tasks/task-dialog/task-dialog.component';
import { TasksService } from '../tasks/tasks.service';
import { describeDue, describeFrequency } from './chore.models';
import { ChoresService } from './chores.service';

describe('ChoresService & TasksService', () => {
  let chores: ChoresService;
  let tasks: TasksService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    chores = TestBed.inject(ChoresService);
    tasks = TestBed.inject(TasksService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('completes and skips chores through the household-scoped endpoints', () => {
    chores.complete('h1', 'c1', 'note').subscribe();
    const done = http.expectOne('/api/households/h1/chores/c1/complete');
    expect(done.request.method).toBe('POST');
    expect(done.request.body).toEqual({ note: 'note' });
    done.flush({});

    chores.skip('h1', 'c1').subscribe();
    const skip = http.expectOne('/api/households/h1/chores/c1/skip');
    expect(skip.request.method).toBe('POST');
    skip.flush({});
  });

  it('lists chores including inactive ones on request', () => {
    chores.list('h1', true).subscribe();
    const req = http.expectOne(
      (r) => r.url === '/api/households/h1/chores' && r.params.get('includeInactive') === 'true',
    );
    req.flush([]);
  });

  it('lists tasks with filters and patches status', () => {
    tasks.list('h1', { includeDone: true, assigneeId: 'u1' }).subscribe();
    const list = http.expectOne(
      (r) =>
        r.url === '/api/households/h1/tasks' &&
        r.params.get('includeDone') === 'true' &&
        r.params.get('assigneeId') === 'u1',
    );
    list.flush([]);

    tasks.update('h1', 't1', { status: 'DONE' }).subscribe();
    const patch = http.expectOne('/api/households/h1/tasks/t1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ status: 'DONE' });
    patch.flush({});

    tasks.addComment('h1', 't1', 'hi').subscribe();
    const comment = http.expectOne('/api/households/h1/tasks/t1/comments');
    expect(comment.request.body).toEqual({ content: 'hi' });
    comment.flush({});
  });
});

describe('chore helpers', () => {
  it('describes due dates', () => {
    expect(describeDue(-3)).toBe('Overdue by 3 days');
    expect(describeDue(-1)).toBe('Overdue by 1 day');
    expect(describeDue(0)).toBe('Due today');
    expect(describeDue(1)).toBe('Due tomorrow');
    expect(describeDue(6)).toBe('Due in 6 days');
  });

  it('describes frequencies', () => {
    expect(describeFrequency({ frequency: 'WEEKLY', intervalDays: null })).toBe('Every week');
    expect(describeFrequency({ frequency: 'CUSTOM', intervalDays: 3 })).toBe('Every 3 days');
    expect(describeFrequency({ frequency: 'CUSTOM', intervalDays: 1 })).toBe('Every day');
  });
});

describe('date-only helpers', () => {
  it('round-trips local calendar dates without timezone drift', () => {
    const date = new Date(2026, 0, 31); // Jan 31 local
    expect(toIsoDate(date)).toBe('2026-01-31');
    const back = fromIsoDate('2026-01-31')!;
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(0);
    expect(back.getDate()).toBe(31);
    expect(toIsoDate(null)).toBeNull();
    expect(fromIsoDate(null)).toBeNull();
  });
});
