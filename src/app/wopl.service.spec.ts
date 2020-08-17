import { TestBed } from '@angular/core/testing';

import { WoplService } from './wopl.service';

describe('WoplService', () => {
  let service: WoplService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WoplService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
