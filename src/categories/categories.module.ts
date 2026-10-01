import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Product } from '../products/entities/product.entity.js'
import { AdminCategoriesController, CategoriesController } from './categories.controller.js'
import { CategoriesService } from './categories.service.js'
import { CategoryDesignTemplateService } from './category-design-template.service.js'
import { CategoryDesignTemplate } from './entities/category-design-template.entity.js'
import { Category } from './entities/category.entity.js'

@Module({
    imports: [TypeOrmModule.forFeature([Category, CategoryDesignTemplate, Product])],
    controllers: [CategoriesController, AdminCategoriesController],
    providers: [CategoriesService, CategoryDesignTemplateService],
})
export class CategoriesModule {}
