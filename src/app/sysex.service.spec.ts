import { TestBed } from '@angular/core/testing';

import { SysexService } from './sysex.service';

describe('SysexService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: SysexService = TestBed.get(SysexService);
    expect(service).toBeTruthy();
  });
});
