import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { currentMonth, monthLabel, shiftMonth } from './expense.models';
import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let http: HttpTestingController;
  const base = '/api/households/h1';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExpensesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists expenses with month, category and cursor filters', () => {
    service.list('h1', { month: '2026-09', category: 'Groceries', cursor: 'c1' }).subscribe();
    const req = http.expectOne(
      (r) =>
        r.url === `${base}/expenses` &&
        r.params.get('month') === '2026-09' &&
        r.params.get('category') === 'Groceries' &&
        r.params.get('cursor') === 'c1',
    );
    req.flush({ items: [], nextCursor: null, totals: [] });
  });

  it('creates with POST and replaces with PUT', () => {
    const input = {
      description: 'Groceries',
      amount: 84.5,
      paidById: 'u1',
      splitMethod: 'EQUAL' as const,
      participants: [{ userId: 'u1' }, { userId: 'u2' }],
    };
    service.create('h1', input).subscribe();
    const post = http.expectOne(`${base}/expenses`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(input);
    post.flush({});

    service.update('h1', 'e1', input).subscribe();
    const put = http.expectOne(`${base}/expenses/e1`);
    expect(put.request.method).toBe('PUT');
    put.flush({});
  });

  it('reads balances and records settlements', () => {
    service.balances('h1').subscribe();
    http.expectOne(`${base}/balances`).flush([]);

    service.settle('h1', { toUserId: 'u2', amount: 20 }).subscribe();
    const settle = http.expectOne(`${base}/settlements`);
    expect(settle.request.method).toBe('POST');
    expect(settle.request.body).toEqual({ toUserId: 'u2', amount: 20 });
    settle.flush({});
  });
});

describe('month helpers', () => {
  it('formats and shifts months', () => {
    expect(currentMonth(new Date(2026, 0, 15))).toBe('2026-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthLabel('2026-09')).toContain('2026');
  });
});
