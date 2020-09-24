import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { NavigationService } from '../../shared/services';

@Component({
  templateUrl: './edit-state.component.html',
})
export class EditStateComponent {
  id: string = null;

  constructor(
    private navigation: NavigationService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.id = this.route.snapshot.params['id'];
  }

  onDelete() {
    this.navigation.backTo(`/states`);
  }
}
