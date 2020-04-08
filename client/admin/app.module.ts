import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { AgenciesModule } from './agencies/agencies.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { StatesModule } from './states/states.module';
import { UsersModule } from './users/users.module';

import { ApiService, NavigationService, UserService } from '../shared/services';


@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    FormsModule,
    HttpClientModule,
    NgbModule,
    AgenciesModule,
    FacilitiesModule,
    StatesModule,
    UsersModule
  ],
  providers: [
    ApiService,
    NavigationService,
    UserService
  ],
  bootstrap: [
    AppComponent
  ]
})
export class AdminAppModule {}
