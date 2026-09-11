import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { parseQuickAdd } from '../../features/shopping/shopping-list-detail/shopping-list-detail.component';
import { ShoppingService } from './shopping.service';

describe('ShoppingService', () => {
  let service: ShoppingService;
  let http: HttpTestingController;
  const base = '/api/households/h1/shopping-lists';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ShoppingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists active lists by default and archived on request', () => {
    service.lists('h1').subscribe();
    http.expectOne(base).flush([]);

    service.lists('h1', true).subscribe();
    const req = http.expectOne((r) => r.url === base && r.params.get('includeArchived') === 'true');
    req.flush([]);
  });

  it('creates lists and items under the household path', () => {
    service.createList('h1', 'Groceries').subscribe();
    const create = http.expectOne(base);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Groceries' });
    create.flush({});

    service.addItem('h1', 'l1', { name: 'Milk', quantity: '2' }).subscribe();
    const add = http.expectOne(`${base}/l1/items`);
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({ name: 'Milk', quantity: '2' });
    add.flush({});
  });

  it('patches items, deletes them and clears completed', () => {
    service.updateItem('h1', 'l1', 'i1', { completed: true }).subscribe();
    const patch = http.expectOne(`${base}/l1/items/i1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ completed: true });
    patch.flush({});

    service.deleteItem('h1', 'l1', 'i1').subscribe();
    const del = http.expectOne(`${base}/l1/items/i1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);

    service.clearCompleted('h1', 'l1').subscribe();
    const clear = http.expectOne(`${base}/l1/items/clear-completed`);
    expect(clear.request.method).toBe('POST');
    clear.flush({ removed: 3 });
  });
});

describe('parseQuickAdd', () => {
  it('extracts a leading quantity', () => {
    expect(parseQuickAdd('2x Milk')).toEqual({ name: 'Milk', quantity: '2' });
    expect(parseQuickAdd('3 x Eggs')).toEqual({ name: 'Eggs', quantity: '3' });
    expect(parseQuickAdd('1.5 × Butter')).toEqual({ name: 'Butter', quantity: '1.5' });
  });

  it('extracts a trailing quantity', () => {
    expect(parseQuickAdd('Milk x2')).toEqual({ name: 'Milk', quantity: '2' });
    expect(parseQuickAdd('Toilet paper x 12')).toEqual({ name: 'Toilet paper', quantity: '12' });
  });

  it('leaves plain names alone, including names containing x', () => {
    expect(parseQuickAdd('Milk')).toEqual({ name: 'Milk' });
    expect(parseQuickAdd('Xylitol gum')).toEqual({ name: 'Xylitol gum' });
    expect(parseQuickAdd('Box of tea')).toEqual({ name: 'Box of tea' });
  });
});
