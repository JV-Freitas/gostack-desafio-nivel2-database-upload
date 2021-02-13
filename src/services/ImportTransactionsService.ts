import csvParse from 'csv-parse';
import { getCustomRepository, getRepository, In, TransactionRepository } from 'typeorm';
import fs from 'fs';

import Category from '../models/Category';
import Transaction from '../models/Transaction';

import TransactionsRepository from '../repositories/TransactionsRepository';



interface CSVTransaction{
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}


class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);


    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      from_line: 2,
    });
    const parseCsv = contactsReadStream.pipe(parsers);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];


    parseCsv.on('data', async line => {
      const [ title, type, value, category ] = line. map((cell: string) =>
      cell.trim(),
      );

      if ( !title || !type || !value ) return;
      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCsv.on('end', resolve));

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title
    );

    const addCategoryTitle = categories
    .filter(category => !existentCategoriesTitles.includes(category))
    .filter((value, index, self) => self.indexOf(value) == index);

    const newCategory = categoriesRepository.create(
      addCategoryTitle.map(title => ({
        title,
      }))
    );

      await categoriesRepository.save(newCategory);

      const finalCategories = [...newCategory, ...existentCategories];

      const createdTransactions = transactionRepository.create(
        transactions.map(transaction => (
          {
            title: transaction.title,
            type: transaction.type,
            value: transaction.value,
            category: finalCategories.find(
              category => category.title == transaction.category
            )
          }
        )))

        await transactionRepository.save(createdTransactions);
        await fs.promises.unlink(filePath);

        return createdTransactions;
  }
    
  
}

export default ImportTransactionsService;
