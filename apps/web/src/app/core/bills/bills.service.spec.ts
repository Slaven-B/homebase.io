import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describeBillDue } from './bill.models';
import { BillsService } from './bills.service';

describe('BillsService', () => {
  let service: BillsService;
  let http: HttpTestingController;
  const base = '/api/households/h1/bills';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BillsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists active bills by default and inactive on request', () => {
    service.list('h1').subscribe();
    http.expectOne(base).flush([]);

    service.list('h1', true).subscribe();
    http.expectOne((r) => r.url === base && r.params.get('includeInactive') === 'true').flush([]);
  });

  it('creates, patches and pays bills', () => {
    service
      .create('h1', { name: 'Internet', amount: 35, dueDate: '2026-09-15', frequency: 'MONTHLY' })
      .subscribe();
    const create = http.expectOne(base);
    expect(create.request.method).toBe('POST');
    expect(create.request.body.amount).toBe(35);
    create.flush({});

    service.update('h1', 'b1', { isActive: false }).subscribe();
    const patch = http.expectOne(`${base}/b1`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush({});

    service.pay('h1', 'b1', { amount: 36, recordAsExpense: true }).subscribe();
    const pay = http.expectOne(`${base}/b1/pay`);
    expect(pay.request.method).toBe('POST');
    expect(pay.request.body).toEqual({ amount: 36, recordAsExpense: true });
    pay.flush({});
  });
});

describe('describeBillDue', () => {
  it('describes due dates and inactive bills', () => {
    expect(describeBillDue({ isActive: true, dueInDays: -3 })).toBe('Overdue by 3 days');
    expect(describeBillDue({ isActive: true, dueInDays: 0 })).toBe('Due today');
    expect(describeBillDue({ isActive: true, dueInDays: 1 })).toBe('Due tomorrow');
    expect(describeBillDue({ isActive: true, dueInDays: 12 })).toBe('Due in 12 days');
    expect(describeBillDue({ isActive: false, dueInDays: 5 })).toBe('Paid / inactive');
  });
});
